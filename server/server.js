const WebSocket = require("ws");
const crypto    = require("crypto");
const http      = require("http");
const fs        = require("fs");
const path      = require("path");
const CFG       = require("./config");

const WORLD_W = 6000;
const WORLD_H = 6000;
const FPS     = 60;
const PORT    = parseInt(process.env.PORT) || 8080;
const ADMIN_PORT = PORT + 1;

// ─────────────────────────────────────────────
// HTTP admin server (port 8081)
// ─────────────────────────────────────────────
const adminHtml = fs.readFileSync(path.join(__dirname, "admin.html"));

const adminServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.url === "/config") {
    if (req.method === "GET") {
      const { save, ...rest } = CFG;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rest));
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        try {
          const updates = JSON.parse(body);
          if (updates.__reset) {
            // Reload defaults
            const DEFAULTS = require("./config");
            Object.assign(CFG, DEFAULTS);
          } else {
            Object.assign(CFG, updates);
          }
          CFG.save();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400); res.end("Bad request");
        }
      });
      return;
    }
  }

  // Admin panel HTML
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(adminHtml);
});

adminServer.listen(ADMIN_PORT, () =>
  console.log(`Panel admin: http://localhost:${ADMIN_PORT}`)
);

// ─────────────────────────────────────────────
// Game HTTP server — serves client + WebSocket on port 8080
// ─────────────────────────────────────────────
const clientDir = path.join(__dirname, "../client");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
};

const gameHttpServer = http.createServer((req, res) => {
  const reqPath  = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(clientDir, safePath);

  if (!fullPath.startsWith(clientDir)) {
    res.writeHead(403); res.end(); return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const mime = MIME_TYPES[path.extname(fullPath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

const wss     = new WebSocket.Server({ server: gameHttpServer });
const clients = new Map();
const rooms   = {};

gameHttpServer.listen(PORT, () =>
  console.log(`Game:         http://localhost:${PORT}`)
);

function createPlayer(id) {
  return {
    id,
    roomId: null,
    name: "Pilot",
    team: null,
    ready: false,
    dead: false,
    hp: 100,
    fuel: 100,
    missileCooldown: 0,
    bulletCooldown: 0,
    missilesActive: 0,
    lockedOnMe: 0,
    flaredCooldown: 0,
    x: 0, y: 0,
    vx: 0, vy: 0,
    angle: 0,
    input: {},
    kills: 0,
    deaths: 0,
    hitFlash: 0,
    shipType: "fighter",
    maxHp: 100,
    maxMissiles: CFG.MISSILE_MAX_ACTIVE,
    missileCooldownBase: CFG.MISSILE_COOLDOWN,
    radarSignature: 450,
    // Crew system
    pilotingFor:  null,
    gunnerId:     null,
    turretAngle:  0,
    turretCooldown: 0,
    // Stats competitivos
    damageDealt:       0,
    assists:           0,
    recentDamageFrom:  [],   // [{attackerId, time}] — solo server, para calcular assists
  };
}

function applyShipStats(p) {
  const ship = CFG.SHIP_TYPES[p.shipType] || CFG.SHIP_TYPES.fighter;
  p.maxHp               = ship.maxHp;
  p.hp                  = ship.maxHp;
  p.thrustVal           = CFG.THRUST          * ship.thrustMult;
  p.reverseThrustVal    = CFG.REVERSE_THRUST  * ship.thrustMult;
  p.turnRateVal         = CFG.TURN_RATE       * ship.turnMult;
  p.dragVal             = ship.dragVal        ?? CFG.DRAG;
  p.fuelRegenVal        = CFG.FUEL_REGEN      * ship.fuelRegenMult;
  p.maxMissiles         = ship.maxMissiles;
  p.missileCooldownBase = ship.missileCooldown;
  p.radarSignature      = ship.radarSignature;
  // Escudos
  p.maxShield             = ship.maxShield      ?? 0;
  p.shield                = p.maxShield;
  p.shieldRegenPerTick    = (ship.shieldRegenRate  ?? 0) / FPS;
  p.shieldRegenDelayTicks = Math.round((ship.shieldRegenDelay ?? 5) * FPS);
  p.shieldHitTimer        = 99999;
  p.shieldFlash           = 0;
  p.shieldHitAngle        = null;
}

// Aplica daño al escudo primero; el excedente va al HP.
// hitAngle: ángulo (rad) desde la posición del objetivo hacia el origen del impacto (coord mundo).
function applyDamage(target, dmg, attacker, hitAngle = null) {
  let dealt = 0;
  if (target.shield > 0 && dmg > 0) {
    const absorbed = Math.min(target.shield, dmg);
    target.shield  = Math.max(0, target.shield - absorbed);
    dmg            -= absorbed;
    dealt          += absorbed;
    target.shieldFlash    = 12;
    target.shieldHitTimer = 0;
    target.shieldHitAngle = hitAngle;
  }
  if (dmg > 0) {
    target.hp  -= dmg;
    target.hitFlash       = 8;
    target.shieldHitTimer = 0;
    dealt += dmg;
  }
  if (attacker) attacker.damageDealt += dealt;
  return dealt;
}

function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcastRoom(room, data) {
  const payload = JSON.stringify(data);
  Object.keys(room.players).forEach(id => {
    const ws = clients.get(id);
    if (ws && ws.readyState === 1) ws.send(payload);
  });
}

function broadcastRoomList() {
  const payload = JSON.stringify({ type: "rooms", rooms: roomList() });
  for (const [, ws] of clients) {
    if (ws.readyState === 1 && !ws.player?.roomId) ws.send(payload);
  }
}

function updateDamageLog(victim, attackerId) {
  const now = Date.now();
  victim.recentDamageFrom = (victim.recentDamageFrom || []).filter(e => now - e.time < 10000);
  const existing = victim.recentDamageFrom.find(e => e.attackerId === attackerId);
  if (existing) existing.time = now;
  else victim.recentDamageFrom.push({ attackerId, time: now });
}

function killPlayer(p, killer, weapon, room) {
  // Assists: jugadores que dañaron a la víctima en los últimos 10s (≠ killer, ≠ víctima, equipo enemigo)
  const now = Date.now();
  for (const entry of (p.recentDamageFrom || [])) {
    if (entry.attackerId === killer?.id) continue;
    if (now - entry.time > 10000) continue;
    const assister = room.players[entry.attackerId];
    if (assister && assister.team !== p.team) assister.assists = (assister.assists || 0) + 1;
  }
  p.recentDamageFrom = [];

  p.hp = 0;
  p.dead = true;
  p.deaths++;
  p.deadAt = Date.now();
  p.respawnReadyAt = Date.now() + ((CFG.RESPAWN_DELAY ?? 5) * 1000);
  room.shipsDestroyed = true;
  if (killer && killer.id !== p.id) killer.kills++;
  // El artillero muere con el piloto
  if (p.gunnerId) {
    const gunner = room.players[p.gunnerId];
    if (gunner && !gunner.dead) {
      gunner.hp = 0;
      gunner.dead = true;
      gunner.deaths++;
      gunner.deadAt = Date.now();
      gunner.respawnReadyAt = Date.now() + ((CFG.RESPAWN_DELAY ?? 5) * 1000);
    }
  }
}
function createAsteroids(count = 40) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    // 50% nivel 0 (colisión), 25% por encima (volar por debajo), 25% por debajo (volar por encima)
    const z = roll < 0.5 ? 0 : roll < 0.75 ? 1 : -1;
    arr.push({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      r: 40 + Math.random() * 100,
      z,
    });
  }
  return arr;
}

function createRoom(ownerId) {
  const id = crypto.randomUUID();
  const asteroids = createAsteroids();
  rooms[id] = {
    id,
    status: "waiting",
    ownerId,
    players: {},
    bullets: [],
    missiles: [],
    flare: [],
    asteroids: asteroids,
    winner:  null,
    killFeed: [],
    timeLeft: 0,
    allowJoinMidGame: false,
  };
  return rooms[id];
}

function joinRoom(player, room) {
  player.roomId = room.id;
  room.players[player.id] = player;
}

function startGame(room) {
  room.status = "playing";
  room.bullets  = [];
  room.missiles = [];
  room.flare    = [];
  room.winner   = null;
  room.shipsDestroyed = false;
  room.timeLeft = CFG.GAME_DURATION_S * FPS;

  // ── 1ª pasada: pilotos y jugadores solos (no artilleros)
  let green = 0, red = 0;
  Object.values(room.players).forEach(p => {
    if (p.team === "green") green++;
    else if (p.team === "red") red++;
  });

  Object.values(room.players).forEach(p => {
    if (p.pilotingFor) return; // artilleros en 2ª pasada

    p.dead  = false;
    p.fuel  = 100;
    p.vx    = 0;
    p.vy    = 0;
    p.angle = 0;
    p.kills  = 0;
    p.deaths = 0;
    p.respawnsLeft   = CFG.RESPAWN_COUNT ?? 3;
    p.deadAt         = null;
    p.respawnReadyAt = 0;
    p.turretAngle    = 0;
    p.turretCooldown = 0;
    p.damageDealt    = 0;
    p.assists        = 0;
    p.recentDamageFrom = [];

    if (p.team !== "green" && p.team !== "red") {
      if (green <= red) { p.team = "green"; green++; }
      else              { p.team = "red";   red++;   }
    }

    applyShipStats(p);

    if (p.team === "green") {
      p.x = 300  + Math.random() * 200;
      p.y = 1000 + Math.random() * 500;
    } else {
      p.x = 2500 + Math.random() * 200;
      p.y = 1000 + Math.random() * 500;
    }
  });

  // ── 2ª pasada: artilleros (posición = piloto, stats de torreta)
  Object.values(room.players).forEach(p => {
    if (!p.pilotingFor) return;
    const pilot = room.players[p.pilotingFor];
    if (!pilot) { p.pilotingFor = null; return; }

    p.team           = pilot.team;
    p.dead           = false;
    p.hp             = 1; p.maxHp = 1; // muere con el piloto
    p.x = pilot.x;  p.y = pilot.y;
    p.vx = 0;        p.vy = 0; p.angle = 0;
    p.kills          = 0; p.deaths = 0;
    p.maxMissiles    = CFG.GUNNER_MISSILES ?? 20;
    p.missileCooldownBase = CFG.GUNNER_MISSILE_COOLDOWN ?? 55;
    p.missileCooldown = 0;
    p.bulletCooldown  = 0;
    p.turretCooldown  = 0;
    p.flaredCooldown  = 0;
    p.respawnsLeft    = CFG.RESPAWN_COUNT ?? 3;
    p.deadAt          = null;
    p.respawnReadyAt  = 0;
    p.hitFlash        = 0;
    p.input           = {};
  });

  room.gameValid = green > 0 && red > 0;
  broadcastRoom(room, { type: "gameStarted" });
}

function pushKill(room, killer, victim, weapon) {
  room.killFeed.unshift({
    killerName: killer ? killer.name : null,
    killerTeam: killer ? killer.team : null,
    victimName: victim.name,
    victimTeam: victim.team,
    weapon,
    time: Date.now()
  });
  if (room.killFeed.length > 6) room.killFeed.pop();
}

function restartRoom(room) {
  room.status   = "waiting";
  room.bullets  = [];
  room.missiles = [];
  room.flare    = [];
  room.winner   = null;
  room.killFeed = [];
  room.shipsDestroyed = false;
  room.gameValid      = false;
  room.timeLeft       = 0;

  Object.values(room.players).forEach(p => {
    p.ready   = false;
    p.dead    = false;
    p.hp      = 100;
    p.fuel    = 100;
    p.vx      = 0;
    p.vy      = 0;
    p.kills   = 0;
    p.deaths  = 0;
    p.hitFlash        = 0;
    p.input           = {};
    p.missileCooldown = 0;
    p.bulletCooldown  = 0;
    p.flaredCooldown  = 0;
    p.respawnsLeft     = CFG.RESPAWN_COUNT ?? 3;
    p.deadAt           = null;
    p.respawnReadyAt   = 0;
    p.pilotingFor      = null;
    p.gunnerId         = null;
    p.turretAngle      = 0;
    p.turretCooldown   = 0;
    p.damageDealt      = 0;
    p.assists          = 0;
    p.recentDamageFrom = [];
    p.shield           = p.maxShield ?? 0;
    p.shieldFlash      = 0;
    p.shieldHitTimer   = 99999;
    p.shieldHitAngle   = null;
  });

  broadcastRoom(room, { type: "roomRestarted", room });
}

function removeFromRoom(player) {
  if (!player.roomId) return;
  const room = rooms[player.roomId];
  if (!room) return;

  // Limpiar vínculos de tripulación
  if (player.gunnerId) {
    const gunner = room.players[player.gunnerId];
    if (gunner) gunner.pilotingFor = null;
    player.gunnerId = null;
  }
  if (player.pilotingFor) {
    const pilot = room.players[player.pilotingFor];
    if (pilot) pilot.gunnerId = null;
    player.pilotingFor = null;
  }

  delete room.players[player.id];
  player.roomId = null;

  if (Object.keys(room.players).length === 0) {
    delete rooms[room.id];
  } else {
    broadcastRoom(room, { type: "roomUpdate", room });
  }
}

const MAX_PLAYERS = 20;

function roomList() {
  return Object.values(rooms).map(r => ({
    id:               r.id,
    players:          Object.keys(r.players).length,
    status:           r.status,
    allowJoinMidGame: r.allowJoinMidGame,
  }));
}

// ─────────────────────────────────────────────
// Connection handling
// ─────────────────────────────────────────────
wss.on("connection", ws => {
  const id     = crypto.randomUUID();
  const player = createPlayer(id);
  ws.player    = player;
  clients.set(id, ws);

  send(ws, { type: "init", id, ships: CFG.SHIP_TYPES });
  send(ws, { type: "rooms", rooms: roomList() });

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === "getRooms") {
      send(ws, { type: "rooms", rooms: roomList() });
      return;
    }

    if (msg.type === "setName") {
      const raw = String(msg.name || "").trim();
      player.name = raw.replace(/[^\w\sÀ-ɏ\-\.]/g, "").slice(0, 16) || "Pilot";
      const room = rooms[player.roomId];
      if (room) broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "leaveRoom") {
      removeFromRoom(player);
      broadcastRoomList();
      return;
    }

    if (msg.type === "createRoom") {
      const room = createRoom(id);
      joinRoom(player, room);
      send(ws, { type: "roomJoined", roomId: room.id });
      broadcastRoom(room, { type: "roomUpdate", room });
      broadcastRoomList();
      return;
    }

    if (msg.type === "joinRoom") {
      const room = rooms[msg.roomId];
      if (!room) return;
      if (room.status === "playing" && !room.allowJoinMidGame) return;
      if (Object.keys(room.players).length >= MAX_PLAYERS) return;
      joinRoom(player, room);
      send(ws, { type: "roomJoined", roomId: room.id });
      broadcastRoom(room, { type: "roomUpdate", room });
      broadcastRoomList();

      // Mid-game spawn: inicializar el jugador directamente en partida
      if (room.status === "playing") {
        const allP = Object.values(room.players);
        const greenCount = allP.filter(p => p.team === "green" && !p.dead).length;
        const redCount   = allP.filter(p => p.team === "red"   && !p.dead).length;
        if (player.team !== "green" && player.team !== "red") {
          player.team = greenCount <= redCount ? "green" : "red";
        }
        applyShipStats(player);
        player.dead = false;
        player.fuel = 100;
        player.vx = 0; player.vy = 0; player.angle = 0;
        player.kills = 0; player.deaths = 0;
        player.respawnsLeft = CFG.RESPAWN_COUNT ?? 3;
        player.deadAt = null; player.respawnReadyAt = 0;
        player.missileCooldown = 0; player.bulletCooldown = 0;
        if (player.team === "green") {
          player.x = 300  + Math.random() * 200;
          player.y = 1000 + Math.random() * 500;
        } else {
          player.x = 2500 + Math.random() * 200;
          player.y = 1000 + Math.random() * 500;
        }
        send(ws, { type: "gameStarted" });
      }
      return;
    }

    if (msg.type === "toggleMidGameJoin") {
      const room = rooms[player.roomId];
      if (!room || room.ownerId !== player.id) return;
      room.allowJoinMidGame = !room.allowJoinMidGame;
      broadcastRoom(room, { type: "roomUpdate", room });
      broadcastRoomList();
      return;
    }

    if (msg.type === "ready") {
      const room = rooms[player.roomId];
      if (!room || room.status !== "waiting") return;

      player.ready = !player.ready;
      broadcastRoom(room, { type: "roomUpdate", room });

      const list = Object.values(room.players);
      if (list.length >= 1 && list.every(p => p.ready)) {
        startGame(room);
        broadcastRoomList();
      }
      return;
    }

    if (msg.type === "switchTeam") {
      const room = rooms[player.roomId];
      if (!room) return;
      if (room.status === "playing") {
        if (!player.dead) return;
        player.team = player.team === "green" ? "red" : "green";
        return;
      }
      player.team   = player.team === "green" ? "red" : "green";
      player.dead   = false;
      player.hp     = 100;
      player.fuel   = 100;
      player.vx     = 0;
      player.vy     = 0;
      player.targetId = null;
      // Sincronizar equipo del artillero si tiene uno
      if (player.gunnerId) {
        const gunner = room.players[player.gunnerId];
        if (gunner) gunner.team = player.team;
      }
      broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "selectShip") {
      const room = rooms[player.roomId];
      if (!room) return;
      if (!CFG.SHIP_TYPES[msg.shipType]) return;
      const inLobby = room.status === "waiting";
      const deadInGame = room.status === "playing" && player.dead;
      if (!inLobby && !deadInGame) return;
      // Si cambia de Capital a otra nave, expulsa al artillero (solo en lobby)
      if (inLobby && player.gunnerId && player.shipType === "gunship" && msg.shipType !== "gunship") {
        const gunner = room.players[player.gunnerId];
        if (gunner) gunner.pilotingFor = null;
        player.gunnerId = null;
      }
      player.shipType = msg.shipType;
      if (inLobby) broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "boardShip") {
      const room = rooms[player.roomId];
      if (!room || room.status !== "waiting") return;
      const target = room.players[msg.targetId];
      if (!target || target.shipType !== "gunship") return;
      if (target.gunnerId) return;          // ya tiene artillero
      if (player.pilotingFor) return;       // ya es artillero de otro
      if (player.id === msg.targetId) return; // no puede ser artillero de sí mismo
      target.gunnerId  = player.id;
      player.pilotingFor = target.id;
      player.team      = target.team;       // mismo equipo que el piloto
      broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "leaveShip") {
      const room = rooms[player.roomId];
      if (!room || !player.pilotingFor) return;
      const pilot = room.players[player.pilotingFor];
      if (pilot) pilot.gunnerId = null;
      player.pilotingFor = null;
      broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "input") { player.input = msg; return; }

    if (msg.type === "flare") {
      const room = rooms[player.roomId];
      if (!room || player.flaredCooldown > 0) return;    
      room.flare = room.flare || [];    
      room.flare.push({
        id: Date.now() + Math.random(),
        x: player.x,
        y: player.y,
        life: CFG.FLARE_LIFE,
        team: player.team
      });    
      player.flaredCooldown = CFG.FLARE_COOLDOWN;
    }

    if (msg.type === "missile") {
      const room = rooms[player.roomId];
      if (!room || player.dead) return;
      if (player.missileCooldown > 0) return;
      const active = room.missiles.filter(m => m.ownerId === player.id).length;
      if (active >= (player.maxMissiles ?? CFG.MISSILE_MAX_ACTIVE)) return;

      // Artillero lanza desde la posición del piloto con ángulo de torreta
      const origin = player.pilotingFor ? room.players[player.pilotingFor] : player;
      if (!origin || origin.dead) return;
      const fireAngle = player.pilotingFor ? origin.turretAngle : player.angle;

      room.missiles.push({
        x:        origin.x,
        y:        origin.y,
        vx:       Math.cos(fireAngle) * CFG.MISSILE_SPEED_INIT,
        vy:       Math.sin(fireAngle) * CFG.MISSILE_SPEED_INIT,
        team:     player.team,
        targetId: msg.targetId,
        ownerId:  player.id,
        life:     CFG.MISSILE_LIFE
      });

      player.missileCooldown = player.missileCooldownBase ?? CFG.MISSILE_COOLDOWN;
    }

    if (msg.type === "selfDestruct") {
      const room = rooms[player.roomId];
      if (!room || room.status !== "playing" || player.dead) return;
      killPlayer(player, null, "self", room);
      return;
    }

    if (msg.type === "respawn") {
      const room = rooms[player.roomId];
      if (!room || room.status !== "playing" || !player.dead) return;
      if ((player.respawnsLeft ?? 0) <= 0) return;
      if (Date.now() < (player.respawnReadyAt ?? 0)) return;
      player.respawnsLeft--;
      player.dead   = false;
      player.deadAt = null;
      // Artillero eyectado: sale como caza independiente
      if (player.pilotingFor) {
        const pilot = room.players[player.pilotingFor];
        if (pilot) pilot.gunnerId = null;
        player.pilotingFor = null;
        player.shipType    = "fighter";
      }
      applyShipStats(player);
      player.vx = 0; player.vy = 0; player.angle = 0;
      player.missileCooldown = 0; player.bulletCooldown = 0;
      if (player.team === "green") {
        player.x = 300  + Math.random() * 200;
        player.y = 1000 + Math.random() * 500;
      } else {
        player.x = 2500 + Math.random() * 200;
        player.y = 1000 + Math.random() * 500;
      }
      return;
    }

    if (msg.type === "restartGame") {
      const room = rooms[player.roomId];
      if (!room || room.ownerId !== player.id || room.status !== "playing") return;
      restartRoom(room);
      broadcastRoomList();
      return;
    }

    if (msg.type === "chat") {
      const room = rooms[player.roomId];
      if (!room || room.status !== "playing") return;
      const text = String(msg.text || "").trim().slice(0, 60);
      if (!text) return;
      broadcastRoom(room, { type: "chat", name: player.name, team: player.team, text });
      return;
    }

    if (msg.type === "shoot") {
      const room = rooms[player.roomId];
      if (!room || player.dead) return;

      if (player.pilotingFor) {
        // Artillero: disparo de torreta
        const pilot = room.players[player.pilotingFor];
        if (!pilot || pilot.dead) return;
        if (player.turretCooldown > 0) return;
        player.turretCooldown = CFG.TURRET_COOLDOWN;
        room.bullets.push({
          x: pilot.x, y: pilot.y,
          vx: Math.cos(pilot.turretAngle) * CFG.TURRET_BULLET_SPEED,
          vy: Math.sin(pilot.turretAngle) * CFG.TURRET_BULLET_SPEED,
          team: player.team, ownerId: player.id,
          damage: CFG.TURRET_DAMAGE,
        });
      } else {
        // Piloto: disparo normal
        if (player.bulletCooldown > 0) return;
        player.bulletCooldown = CFG.BULLET_COOLDOWN;
        room.bullets.push({
          x: player.x, y: player.y,
          vx: Math.cos(player.angle) * CFG.BULLET_SPEED,
          vy: Math.sin(player.angle) * CFG.BULLET_SPEED,
          team: player.team, ownerId: player.id,
          damage: CFG.BULLET_DAMAGE,
        });
      }
    }
  });

  ws.on("close", () => {
    removeFromRoom(player);
    clients.delete(id);
    broadcastRoomList();
  });
});

// ─────────────────────────────────────────────
// Missile guidance
// ─────────────────────────────────────────────
function steerMissile(m, tx, ty, maxTurn, thrust) {
  const dx = tx - m.x;
  const dy = ty - m.y;
  const currentSpeed = Math.hypot(m.vx, m.vy);
  const currentAngle = currentSpeed > 0.5 ? Math.atan2(m.vy, m.vx) : Math.atan2(dy, dx);
  const desiredAngle = Math.atan2(dy, dx);
  let diff = desiredAngle - currentAngle;
  if (diff >  Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  const newAngle = currentAngle + Math.max(-maxTurn, Math.min(maxTurn, diff));
  // Rotate velocity vector to new angle and accelerate
  const newSpeed = Math.min(currentSpeed + thrust, CFG.MISSILE_SPEED_MAX);
  m.vx = Math.cos(newAngle) * newSpeed;
  m.vy = Math.sin(newAngle) * newSpeed;
}

// ─────────────────────────────────────────────
// Game loop
// ─────────────────────────────────────────────

function update() {
  Object.values(rooms).forEach(room => {
    if (room.status !== "playing") return;

    // ── Players
    Object.values(room.players).forEach(p => {
      if (p.dead) return;

      // Artillero: sincronizar al piloto y procesar su turno
      if (p.pilotingFor) {
        const pilot = room.players[p.pilotingFor];
        if (!pilot || pilot.dead) return; // muere con el piloto via killPlayer
        p.x     = pilot.x;
        p.y     = pilot.y;
        p.angle = pilot.angle;
        if (p.turretCooldown  > 0) p.turretCooldown--;
        if (p.missileCooldown > 0) p.missileCooldown--;
        const inp = p.input || {};
        if (inp.targetAngle != null) pilot.turretAngle = inp.targetAngle;
        return;
      }

      p.lockedByMissile = false;
      p.lockedOnMe      = 0;

      if (p.missileCooldown > 0) p.missileCooldown--;
      if (p.bulletCooldown  > 0) p.bulletCooldown--;
      if (p.hitFlash        > 0) p.hitFlash--;
      if (p.shieldFlash     > 0) p.shieldFlash--;
      if (p.flaredCooldown  > 0) p.flaredCooldown--;
      // Recarga de escudo
      if ((p.shieldHitTimer ?? 99999) < (p.shieldRegenDelayTicks ?? 99999)) {
        p.shieldHitTimer++;
      } else if ((p.shield ?? 0) < (p.maxShield ?? 0)) {
        p.shield = Math.min(p.maxShield, p.shield + p.shieldRegenPerTick);
      }

      const i = p.input || {};

      // Rotación: mouse aim (targetAngle) o fallback teclado
      if (i.targetAngle != null) {
        let diff = i.targetAngle - p.angle;
        while (diff >  Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const maxTurn = p.turnRateVal ?? CFG.TURN_RATE;
        p.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
      } else {
        if (i.left)  p.angle -= (p.turnRateVal ?? CFG.TURN_RATE);
        if (i.right) p.angle += (p.turnRateVal ?? CFG.TURN_RATE);
      }

      const thrustVal   = p.thrustVal        ?? CFG.THRUST;
      const reverseVal  = p.reverseThrustVal ?? CFG.REVERSE_THRUST;
      const strafeVal   = thrustVal * 0.7;

      if (i.thrust && p.fuel > 0) {
        p.vx  += Math.cos(p.angle) * thrustVal;
        p.vy  += Math.sin(p.angle) * thrustVal;
        p.fuel = Math.max(0, p.fuel - CFG.THRUST_FUEL);
      } else if (i.reverse && p.fuel > 0) {
        p.vx  -= Math.cos(p.angle) * reverseVal;
        p.vy  -= Math.sin(p.angle) * reverseVal;
        p.fuel = Math.max(0, p.fuel - CFG.REVERSE_FUEL);
      } else if (p.fuel < 100) {
        p.fuel = Math.min(100, p.fuel + (p.fuelRegenVal ?? CFG.FUEL_REGEN));
      }

      // Strafe lateral (A/D) — perpendicular izquierda/derecha en canvas (Y↓)
      if (i.strafeLeft && p.fuel > 0) {
        p.vx += Math.sin(p.angle) * strafeVal;
        p.vy -= Math.cos(p.angle) * strafeVal;
        p.fuel = Math.max(0, p.fuel - CFG.THRUST_FUEL * 0.5);
      }
      if (i.strafeRight && p.fuel > 0) {
        p.vx -= Math.sin(p.angle) * strafeVal;
        p.vy += Math.cos(p.angle) * strafeVal;
        p.fuel = Math.max(0, p.fuel - CFG.THRUST_FUEL * 0.5);
      }

      if (i.inertiaDamp !== false) {
        p.vx *= (p.dragVal ?? CFG.DRAG);
        p.vy *= (p.dragVal ?? CFG.DRAG);
      }
      p.x  += p.vx;
      p.y  += p.vy;
      p.x   = Math.max(0, Math.min(WORLD_W, p.x));
      p.y   = Math.max(0, Math.min(WORLD_H, p.y));
    });

    // ── Asteroid collision
    Object.values(room.players).forEach(p => {
      if (p.dead) return;
    
      for (const ast of room.asteroids) {
        if (ast.z !== 0) continue; // por encima o por debajo → sin colisión
        const dx = p.x - ast.x;
        const dy = p.y - ast.y;
        const dist = Math.hypot(dx, dy);
    
        const min = ast.r + 14;
    
        if (dist < min) {    
          // ── normal de colisión
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
    
          // ── corregir penetración (sacar fuera del asteroide)
          const penetration = min - dist;
          p.x += nx * penetration;
          p.y += ny * penetration;
    
          // ── velocidad actual
          const vx = p.vx;
          const vy = p.vy;
    
          // ── velocidad en dirección de la normal (impacto real)
          const dot = vx * nx + vy * ny;
    
          // ── solo si viene HACIA el asteroide
          if (dot < 0) {    
            const restitution = 0.35; // rebote (0 = absorbe, 1 = perfecto rebote)
    
            // ── rebote físico correcto
            p.vx = vx - (1 + restitution) * dot * nx;
            p.vy = vy - (1 + restitution) * dot * ny;
    
            // ── daño SOLO si supera velocidad mínima
            const impactSpeed = -dot;
    
            if (impactSpeed > CFG.ASTEROID_IMPACT_MIN) {    
              const damage =
                (impactSpeed - CFG.ASTEROID_IMPACT_MIN) *
                CFG.ASTEROID_DAMAGE_FACTOR;
    
              // Dirección del impacto: desde la nave hacia el asteroide = -(normal)
              const impactAngle = Math.atan2(-ny, -nx);
              applyDamage(p, Math.floor(damage), null, impactAngle);

              if (p.hp <= 0) {
                killPlayer(p, null, "asteroid", room);
              }
            }
          }
        }
      }
    });

    // ── Bullets
    room.bullets.forEach(b => { b.x += b.vx; b.y += b.vy; });
    room.bullets = room.bullets.filter(b =>
      b.x > -100 && b.x < WORLD_W + 100 &&
      b.y > -100 && b.y < WORLD_H + 100
    );

    for (let i = room.bullets.length - 1; i >= 0; i--) {
      const b = room.bullets[i];
      for (const p of Object.values(room.players)) {
        if (p.dead || p.team === b.team || p.pilotingFor) continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) < CFG.BULLET_RADIUS) {
          const dmg = b.damage ?? CFG.BULLET_DAMAGE;
          const attacker = room.players[b.ownerId];
          const bulletAngle = Math.atan2(b.y - p.y, b.x - p.x);
          applyDamage(p, dmg, attacker, bulletAngle);
          if (attacker) updateDamageLog(p, attacker.id);
          if (p.hp <= 0) killPlayer(p, attacker || null, "bullet", room);
          room.bullets.splice(i, 1);
          break;
        }
      }
    }

    // ── Missiles
    room.missiles.forEach(m => {
      const flares = room.flare || [];

      // ¿Está siguiendo una flare?
      const flareTarget = m.flareTarget
        ? flares.find(f => f.id === m.flareTarget)
        : null;

      // ¿Está siguiendo un avión?
      const target = m.targetId
        ? room.players[m.targetId]
        : null;

      if (target && !target.dead) {
        target.lockedByMissile = true;
        target.lockedOnMe++;
      }

      // Si todavía no fue engañado por una flare
      if (!m.flareTarget) {
        for (const f of flares) {
          if (Math.hypot(m.x - f.x, m.y - f.y) < CFG.FLARE_RADIUS) {
            // 90% de probabilidad de perder el lock
            if (Math.random() < 0.9) {
              m.flareTarget = f.id;
              m.targetId = null;
            }
            break;
          }
        }
      }

      // Persigue la flare
      if (flareTarget) {
        steerMissile(
          m,
          flareTarget.x,
          flareTarget.y,
          CFG.FLARE_TURN,
          CFG.FLARE_THRUST
        );
      }
      // Persigue a la nave
      else if (target && !target.dead) {
        steerMissile(
          m,
          target.x,
          target.y,
          CFG.MISSILE_TURN,
          CFG.MISSILE_THRUST
        );
      }
      m.x += m.vx;
      m.y += m.vy;
      m.life--;
    });

    room.missiles = room.missiles.filter(m => m.life > 0);

    for (let i = room.missiles.length - 1; i >= 0; i--) {
      const m = room.missiles[i];
      for (const p of Object.values(room.players)) {
        if (p.dead || p.team === m.team || p.pilotingFor) continue;
        if (Math.hypot(p.x - m.x, p.y - m.y) < CFG.MISSILE_RADIUS) {
          const attacker = room.players[m.ownerId];
          const missileAngle = Math.atan2(m.y - p.y, m.x - p.x);
          applyDamage(p, CFG.MISSILE_DAMAGE, attacker, missileAngle);
          if (attacker) updateDamageLog(p, attacker.id);
          if (p.hp <= 0) killPlayer(p, attacker || null, "missile", room);
          room.missiles.splice(i, 1);
          break;
        }
      }
    }

    // ── Flares
    room.flare = (room.flare || []).filter(f => { f.life--; return f.life > 0; });

    // ── Timer
    if (room.timeLeft > 0) room.timeLeft--;

    // ── Win condition
    const allPlayers  = Object.values(room.players);
    const greenAlive  = allPlayers.filter(p => p.team === "green" && !p.dead).length;
    const redAlive    = allPlayers.filter(p => p.team === "red"   && !p.dead).length;

    if (!room.winner) {
      if (room.gameValid && room.shipsDestroyed) {
        const greenAllOut = greenAlive === 0 && !allPlayers.some(p => p.team === "green" && p.dead && (p.respawnsLeft ?? 0) > 0);
        const redAllOut   = redAlive   === 0 && !allPlayers.some(p => p.team === "red"   && p.dead && (p.respawnsLeft ?? 0) > 0);
        if (greenAllOut) room.winner = "red";
        if (redAllOut)   room.winner = "green";
      }

      // Time's up
      if (room.timeLeft <= 0 && room.gameValid) {
        if      (greenAlive > redAlive) room.winner = "green";
        else if (redAlive > greenAlive) room.winner = "red";
        else {
          const greenKills = allPlayers.filter(p => p.team === "green").reduce((s,p) => s + (p.kills||0), 0);
          const redKills   = allPlayers.filter(p => p.team === "red"  ).reduce((s,p) => s + (p.kills||0), 0);
          if      (greenKills > redKills) room.winner = "green";
          else if (redKills > greenKills) room.winner = "red";
          else {
            // Desempate por daño total infligido
            const greenDmg = allPlayers.filter(p => p.team === "green").reduce((s,p) => s + (p.damageDealt||0), 0);
            const redDmg   = allPlayers.filter(p => p.team === "red"  ).reduce((s,p) => s + (p.damageDealt||0), 0);
            if      (greenDmg > redDmg) room.winner = "green";
            else if (redDmg > greenDmg) room.winner = "red";
            else                        room.winner = "draw";
          }
        }
      }
    }

    // ── Broadcast
    broadcastRoom(room, {
      type:      "state",
      players:   room.players,
      bullets:   room.bullets,
      missiles:  room.missiles,
      flare:     room.flare || [],
      asteroids: room.asteroids,
      winner:    room.winner,
      killFeed:  room.killFeed,
      timeLeft:  Math.max(0, Math.ceil(room.timeLeft / FPS)),
      world:     { width: WORLD_W, height: WORLD_H }
    });
  });
}

setInterval(update, 1000 / FPS);
