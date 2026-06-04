const WebSocket = require("ws");
const crypto    = require("crypto");
const http      = require("http");
const fs        = require("fs");
const path      = require("path");
const CFG       = require("./config");

const FPS     = 60;

const WORLD_PRESETS = {
  small:  { w: 3000,  h: 3000,  asteroids: 15,  label: "Pequeño" },
  medium: { w: 6000,  h: 6000,  asteroids: 40,  label: "Medio"   },
  large:  { w: 10000, h: 10000, asteroids: 80,  label: "Grande"  },
  huge:   { w: 15000, h: 15000, asteroids: 130, label: "Enorme"  },
};

function spawnPos(team, room) {
  const W = room.worldW, H = room.worldH;
  if (team === "green") {
    return { x: W * 0.05 + Math.random() * W * 0.033, y: H * 0.167 + Math.random() * H * 0.083 };
  }
  return { x: W * 0.417 + Math.random() * W * 0.033, y: H * 0.167 + Math.random() * H * 0.083 };
}
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
  p.bulletDamage        = ship.bulletDamage ?? CFG.BULLET_DAMAGE;
  p.firesTorpedoes      = !!ship.torpedo;
  // Escudos
  p.maxShield             = ship.maxShield      ?? 0;
  p.shield                = p.maxShield;
  p.shieldRegenPerTick    = (ship.shieldRegenRate  ?? 0) / FPS;
  p.shieldRegenDelayTicks = Math.round((ship.shieldRegenDelay ?? 5) * FPS);
  p.shieldHitTimer        = 99999;
  p.shieldFlash           = 0;
  p.shieldHitAngle        = null;
  // Rayo de la Capital
  p.beamCharging   = false;
  p.beamChargeTicks = 0;
  p.beamCharge     = 0;
  // EMP / apagado
  p.empTimer        = 0;
  p.empMax          = 0;
  p.emp             = 0;
  p.empDisableTicks = 0;
  p.empDisabled     = false;
  p.empCooldown     = 0;
  // Minas (Interceptor)
  p.mineCooldown    = 0;
  // Nave Capital: 3 slots de artillero
  if (p.shipType === "capital") {
    if (!p.gunnerIds)    p.gunnerIds    = [null, null, null];
    if (!p.turretAngles) p.turretAngles = {};
  }
}

// Aplica daño al escudo primero; el excedente va al HP.
// hitAngle: ángulo (rad) desde la posición del objetivo hacia el origen del impacto (coord mundo).
function applyDamage(room, target, dmg, attacker, hitAngle = null) {
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
  if (attacker) {
    attacker.damageDealt += dealt;

    // Daño del artillero se comparte con el piloto
    /*if (attacker.pilotingFor) {
      const pilot = room.players[attacker.pilotingFor];
      if (pilot) pilot.damageDealt += dealt;
    }*/
  }
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

function registerCrewDamage(victim, attacker, room) {
  updateDamageLog(victim, attacker.id);

  if (attacker.pilotingFor != null) {
    const pilot = room.players[attacker.pilotingFor];
    if (pilot) {
      updateDamageLog(victim, pilot.id);
    }
  }

  if (attacker.gunnerId) {
    updateDamageLog(victim, attacker.gunnerId);
  }

  if (attacker.gunnerIds) {
    attacker.gunnerIds
      .filter(Boolean)
      .forEach(id => updateDamageLog(victim, id));
  }
}

// Desvincula a un artillero de su nave, liberando la plaza en el piloto.
function detachGunner(room, gunner) {
  if (!gunner || !gunner.pilotingFor) return;
  const pilot = room.players[gunner.pilotingFor];
  if (pilot) {
    if (pilot.gunnerIds) {
      const idx = pilot.gunnerIds.indexOf(gunner.id);
      if (idx !== -1) pilot.gunnerIds[idx] = null;
    }
    if (pilot.gunnerId === gunner.id) pilot.gunnerId = null;
    if (pilot.turretAngles) delete pilot.turretAngles[gunner.id];
  }
  gunner.pilotingFor = null;
  gunner.turretIndex = undefined;
}

// Libera todas las plazas de una nave y desvincula a su tripulación
// (al destruirse la nave o al salir/desconectarse el piloto).
function clearCrewSeats(room, pilot) {
  const crewIds = pilot.gunnerIds ? pilot.gunnerIds.filter(Boolean) : (pilot.gunnerId ? [pilot.gunnerId] : []);
  for (const gid of crewIds) {
    const g = room.players[gid];
    if (g) { g.pilotingFor = null; g.turretIndex = undefined; }
  }
  if (pilot.gunnerIds) pilot.gunnerIds = [null, null, null];
  pilot.gunnerId = null;
  if (pilot.turretAngles) pilot.turretAngles = {};
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
  p.beamCharging = false;
  p.beamChargeTicks = 0;
  p.beamCharge = 0;
  p.empTimer = 0;
  p.emp = 0;
  p.empDisableTicks = 0;
  p.empDisabled = false;
  p.deaths++;
  p.deadAt = Date.now();
  p.respawnReadyAt = Date.now() + ((CFG.RESPAWN_DELAY ?? 5) * 1000);
  room.shipsDestroyed = true;
  if (killer && killer.id !== p.id) {
    killer.kills++;

    // Kills del artillero se comparten con el piloto (y viceversa)
    /*if (killer.pilotingFor) {
      const pilot = room.players[killer.pilotingFor];
      if (pilot) pilot.kills++;
    } else if (killer.gunnerId) {
      const gunner = room.players[killer.gunnerId];
      if (gunner) gunner.kills++;
    } else if (killer.gunnerIds) {
      killer.gunnerIds.filter(Boolean).forEach(gid => {
        const g = room.players[gid];
        if (g) g.kills++;
      });
    }*/
  }
  // Artilleros mueren con el piloto (Gunship: uno; Capital: hasta 3)
  const crewIds = p.gunnerIds ? p.gunnerIds.filter(Boolean) : (p.gunnerId ? [p.gunnerId] : []);
  for (const gid of crewIds) {
    const gunner = room.players[gid];
    if (gunner && !gunner.dead) {
      gunner.hp = 0;
      gunner.dead = true;
      gunner.deaths++;
      gunner.deadAt = Date.now();
      gunner.respawnReadyAt = Date.now() + ((CFG.RESPAWN_DELAY ?? 5) * 1000);
    }
  }
  // La nave fue destruida: libera las plazas y desvincula a la tripulación para que
  // al reaparecer puedan reelegir nave o volver a embarcar en otra torreta.
  clearCrewSeats(room, p);
}
function createAsteroids(count, W, H) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    const z = roll < 0.5 ? 0 : roll < 0.75 ? 1 : -1;
    arr.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 40 + Math.random() * 100,
      z,
    });
  }
  return arr;
}

function createRoom(ownerId, ownerName) {
  const id     = crypto.randomUUID();
  const preset = WORLD_PRESETS.medium;
  const W = preset.w, H = preset.h;
  rooms[id] = {
    id,
    status: "waiting",
    ownerId,
    name: ownerName ? `Sala de ${ownerName}`.slice(0, 28) : "Nueva sala",
    enforceBalance: false,
    worldSize: "medium",
    worldW: W,
    worldH: H,
    players: {},
    bullets: [],
    missiles: [],
    beams: [],
    empPulses: [],
    mines: [],
    flare: [],
    asteroids: createAsteroids(preset.asteroids, W, H),
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
  if (room.coopMode) player.team = "green";   // co-op: todos en el mismo equipo
}

function startGame(room) {
  room.status = "playing";
  room.bullets  = [];
  room.missiles = [];
  room.beams    = [];
  room.empPulses = [];
  room.mines    = [];
  room.flare    = [];
  room.winner   = null;
  room.shipsDestroyed = false;
  room.timeLeft = (room.durationS ?? CFG.GAME_DURATION_S) * FPS;

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

    if (room.coopMode) {
      p.team = "green";          // co-op: todos los humanos juntos vs IA
    } else if (p.team !== "green" && p.team !== "red") {
      if (green <= red) { p.team = "green"; green++; }
      else              { p.team = "red";   red++;   }
    }

    applyShipStats(p);

    const sp = spawnPos(p.team, room);
    p.x = sp.x; p.y = sp.y;
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
    p.damageDealt    = 0;  // reset que faltaba en artilleros
    p.assists        = 0;
    p.recentDamageFrom = [];
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

  // Co-op vs IA: arranca el modo oleadas (los bots aparecen por rondas)
  if (room.coopMode) {
    room.waveMode  = true;
    room.wave      = 0;
    room.waveState = "intermission";
    room.waveTimer = 3 * FPS;     // primera oleada en ~3s
    room.teamLives = TEAM_LIVES;  // pool de vidas compartido del equipo
    setWaveBanner(room, "PREPARAOS...", 3000);
  }

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
  // Co-op: elimina los bots y reinicia el estado de oleadas
  Object.keys(room.players).forEach(pid => { if (room.players[pid].isBot) delete room.players[pid]; });
  room.waveMode  = false;
  room.wave      = 0;
  room.waveState = null;
  room.waveBanner = null;
  room.bullets  = [];
  room.missiles = [];
  room.beams    = [];
  room.empPulses = [];
  room.mines    = [];
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

  // Limpiar vínculos de tripulación (artillero y/o piloto, Gunship y Capital)
  detachGunner(room, player);     // si era artillero, libera su plaza
  clearCrewSeats(room, player);   // si pilotaba, desvincula a sus artilleros

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
  return Object.values(rooms).filter(r => !r.solo).map(r => ({
    id:               r.id,
    name:             r.name || "Nueva sala",
    players:          Object.keys(r.players).length,
    status:           r.status,
    allowJoinMidGame: r.allowJoinMidGame,
    enforceBalance:   r.enforceBalance,
    worldSize:        r.worldSize || "medium",
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
      const room = createRoom(id, player.name);
      joinRoom(player, room);
      send(ws, { type: "roomJoined", roomId: room.id });
      broadcastRoom(room, { type: "roomUpdate", room });
      broadcastRoomList();
      return;
    }

    // Práctica en solitario: sala privada (no listada ni unible) que arranca al instante
    // con un solo jugador y un temporizador configurable.
    if (msg.type === "startSolo") {
      const room = createRoom(id, player.name);
      room.solo = true;
      room.name = "Práctica";
      // Tamaño de mundo
      const preset = WORLD_PRESETS[msg.size] || WORLD_PRESETS.medium;
      room.worldSize = WORLD_PRESETS[msg.size] ? msg.size : "medium";
      room.worldW = preset.w; room.worldH = preset.h;
      room.asteroids = createAsteroids(preset.asteroids, preset.w, preset.h);
      // Duración (s): >0 acota a [30, 3600]; 0 o vacío = prácticamente ilimitada
      const secs = Number(msg.durationS);
      room.durationS = (Number.isFinite(secs) && secs > 0) ? Math.min(3600, Math.max(30, secs)) : 999999;

      joinRoom(player, room);
      player.team = "green";
      if (CFG.SHIP_TYPES[msg.shipType]) player.shipType = msg.shipType;
      send(ws, { type: "roomJoined", roomId: room.id });
      startGame(room);          // arranca ya (1 jugador); gameValid=false → sin condición de victoria

      // Modo oleadas: enemigos por rondas escaladas hasta el jefe (Capital)
      if (msg.mode === "waves") {
        room.waveMode  = true;
        room.wave      = 0;
        room.waveState = "intermission";
        room.waveTimer = 2 * FPS;     // primera oleada en ~2s
        room.teamLives = TEAM_LIVES;  // pool de vidas compartido
        setWaveBanner(room, "PREPÁRATE...", 2000);
      }

      broadcastRoomList();
      return;
    }

    if (msg.type === "joinRoom") {
      const room = rooms[msg.roomId];
      if (!room || room.solo) return;
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
        const sp = spawnPos(player.team, room);
        player.x = sp.x; player.y = sp.y;
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

    // Modo co-op vs IA: todos los jugadores en un equipo (verde) contra oleadas de bots
    if (msg.type === "toggleCoop") {
      const room = rooms[player.roomId];
      if (!room || room.ownerId !== player.id || room.status !== "waiting") return;
      room.coopMode = !room.coopMode;
      if (room.coopMode) {
        room.enforceBalance = false;
        // Todos al equipo verde (humanos juntos contra la IA)
        Object.values(room.players).forEach(p => { p.team = "green"; });
      }
      broadcastRoom(room, { type: "roomUpdate", room });
      broadcastRoomList();
      return;
    }

    if (msg.type === "setWorldSize") {
      const room = rooms[player.roomId];
      if (!room || room.ownerId !== player.id || room.status !== "waiting") return;
      const preset = WORLD_PRESETS[msg.size];
      if (!preset) return;
      room.worldSize = msg.size;
      room.worldW    = preset.w;
      room.worldH    = preset.h;
      // Regenerar asteroides con el nuevo tamaño
      room.asteroids = createAsteroids(preset.asteroids, preset.w, preset.h);
      broadcastRoom(room, { type: "roomUpdate", room });
      broadcastRoomList();
      return;
    }

    if (msg.type === "setRoomName") {
      const room = rooms[player.roomId];
      if (!room || room.ownerId !== player.id || room.status !== "waiting") return;
      room.name = String(msg.name || "").trim().slice(0, 28) || "Nueva sala";
      broadcastRoom(room, { type: "roomUpdate", room });
      broadcastRoomList();
      return;
    }

    if (msg.type === "toggleEnforceBalance") {
      const room = rooms[player.roomId];
      if (!room || room.ownerId !== player.id || room.status !== "waiting") return;
      room.enforceBalance = !room.enforceBalance;
      broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "ready") {
      const room = rooms[player.roomId];
      if (!room || room.status !== "waiting") return;

      player.ready = !player.ready;
      broadcastRoom(room, { type: "roomUpdate", room });

      const list = Object.values(room.players);
      if (list.length >= 1 && list.every(p => p.ready)) {
        if (room.enforceBalance) {
          const gc = list.filter(p => p.team === "green").length;
          const rc = list.filter(p => p.team === "red").length;
          if (gc !== rc) {
            broadcastRoom(room, { type: "balanceError", green: gc, red: rc });
            return;
          }
        }
        startGame(room);
        broadcastRoomList();
      }
      return;
    }

    if (msg.type === "switchTeam") {
      const room = rooms[player.roomId];
      if (!room) return;
      if (room.coopMode) return;   // en co-op todos van juntos vs IA, sin cambio de equipo
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
      // Sincronizar equipo de todos los artilleros
      if (player.gunnerId) {
        const gunner = room.players[player.gunnerId];
        if (gunner) gunner.team = player.team;
      }
      if (player.gunnerIds) {
        player.gunnerIds.filter(Boolean).forEach(gid => {
          const g = room.players[gid];
          if (g) g.team = player.team;
        });
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
      // Expulsar artilleros al cambiar de nave multi-crew (solo en lobby)
      if (inLobby) {
        if (player.gunnerId && player.shipType === "gunship" && msg.shipType !== "gunship") {
          const gunner = room.players[player.gunnerId];
          if (gunner) { gunner.pilotingFor = null; gunner.turretIndex = undefined; }
          player.gunnerId = null;
        }
        if (player.gunnerIds && player.shipType === "capital" && msg.shipType !== "capital") {
          player.gunnerIds.forEach((gid, idx) => {
            if (!gid) return;
            const g = room.players[gid];
            if (g) { g.pilotingFor = null; g.turretIndex = undefined; }
            player.gunnerIds[idx] = null;
          });
          player.turretAngles = {};
        }
      }
      // Si estaba muerto con una torreta reservada y ahora elige nave propia, soltar la plaza
      if (deadInGame && player.pilotingFor) detachGunner(room, player);
      player.shipType = msg.shipType;
      if (inLobby) broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "boardShip") {
      const room = rooms[player.roomId];
      if (!room) return;
      // Permitido en el lobby, o en partida si el jugador está muerto (elige reaparecer
      // de torretero en una nave aliada con torreta libre).
      const inLobby     = room.status === "waiting";
      const deadInGame  = room.status === "playing" && player.dead;
      if (!inLobby && !deadInGame) return;

      const target = room.players[msg.targetId];
      if (!target || target.dead) return;          // no se aborda una nave destruida
      if (player.id === msg.targetId) return;
      // En partida solo se aborda una nave del propio equipo
      if (deadInGame && target.team !== player.team) return;

      // Si ya tenía una plaza reservada (o su piloto murió), liberarla antes de reasignar
      if (player.pilotingFor) detachGunner(room, player);

      if (target.shipType === "gunship") {
        if (target.gunnerId) return;
        target.gunnerId    = player.id;
        player.pilotingFor = target.id;
        if (inLobby) player.team = target.team;
      } else if (target.shipType === "capital") {
        if (!target.gunnerIds) target.gunnerIds = [null, null, null];
        const slot = target.gunnerIds.indexOf(null);
        if (slot === -1) return;  // nave llena
        target.gunnerIds[slot] = player.id;
        player.pilotingFor  = target.id;
        player.turretIndex  = slot;
        if (inLobby) player.team = target.team;
        if (!target.turretAngles) target.turretAngles = {};
      } else {
        return;
      }
      broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "leaveShip") {
      const room = rooms[player.roomId];
      if (!room || !player.pilotingFor) return;
      detachGunner(room, player);
      broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "input") { player.input = msg; return; }

    if (msg.type === "flare") {
      const room = rooms[player.roomId];
      if (!room || player.flaredCooldown > 0 || player.empDisabled) return;
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
      if (player.empDisabled || (player.pilotingFor && room.players[player.pilotingFor]?.empDisabled)) return;
      if (player.missileCooldown > 0) return;
      const active = room.missiles.filter(m => m.ownerId === player.id).length;
      if (active >= (player.maxMissiles ?? CFG.MISSILE_MAX_ACTIVE)) return;

      // Artillero lanza desde la posición del piloto con ángulo de su torreta
      const origin = player.pilotingFor ? room.players[player.pilotingFor] : player;
      if (!origin || origin.dead) return;
      const fireAngle = player.pilotingFor
        ? ((origin.shipType === "capital" && origin.turretAngles)
            ? (origin.turretAngles[player.id] ?? 0)
            : (origin.turretAngle ?? 0))
        : player.angle;

      room.missiles.push({
        x:        origin.x,
        y:        origin.y,
        vx:       Math.cos(fireAngle) * CFG.MISSILE_SPEED_INIT,
        vy:       Math.sin(fireAngle) * CFG.MISSILE_SPEED_INIT,
        team:     player.team,
        targetId: msg.targetId,
        ownerId:  player.id,
        life:     CFG.MISSILE_LIFE,
        torpedo:  !!player.firesTorpedoes,   // Disruptor lanza torpedos (más grandes y dañinos)
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
      if (Date.now() < (player.respawnReadyAt ?? 0)) return;
      // Vidas: en modo oleadas (co-op / solo-oleadas) hay un pool compartido del equipo;
      // en PVP normal / vuelo libre el respawn es infinito (hasta que acabe el tiempo).
      if (room.waveMode) {
        if ((room.teamLives ?? 0) <= 0) return;
        room.teamLives--;
      }
      // ¿Tiene una torreta reservada en una nave aliada viva? (eligió "ir de torretero")
      const seatPilot = player.pilotingFor ? room.players[player.pilotingFor] : null;
      const seatValid = seatPilot && !seatPilot.dead && seatPilot.team === player.team &&
        (((seatPilot.gunnerIds || []).includes(player.id)) || seatPilot.gunnerId === player.id);

      player.dead   = false;
      player.deadAt = null;

      if (seatValid) {
        // Reaparece directamente como artillero de la nave aliada
        player.team           = seatPilot.team;
        player.hp = 1; player.maxHp = 1;         // muere con el piloto
        player.shield = 0; player.maxShield = 0;
        player.maxMissiles    = CFG.GUNNER_MISSILES ?? 20;
        player.missileCooldownBase = CFG.GUNNER_MISSILE_COOLDOWN ?? 55;
        player.missileCooldown = 0; player.bulletCooldown = 0; player.turretCooldown = 0;
        player.x = seatPilot.x; player.y = seatPilot.y;
        player.vx = 0; player.vy = 0; player.angle = seatPilot.angle;
        if (seatPilot.shipType === "capital") {
          if (!seatPilot.turretAngles) seatPilot.turretAngles = {};
          seatPilot.turretAngles[player.id] = seatPilot.angle;
        }
      } else {
        // Sin reserva válida: eyectar como caza independiente (mantiene la nave elegida)
        detachGunner(room, player);
        if (!CFG.SHIP_TYPES[player.shipType]) player.shipType = "fighter";
        applyShipStats(player);
        player.vx = 0; player.vy = 0; player.angle = 0;
        player.missileCooldown = 0; player.bulletCooldown = 0;
        const rsp = spawnPos(player.team, room);
        player.x = rsp.x; player.y = rsp.y;
      }
      return;
    }

    if (msg.type === "restartGame") {
      const room = rooms[player.roomId];
      if (!room || room.ownerId !== player.id || room.status !== "playing") return;
      if (room.solo) return;   // las salas de práctica no se reinician (se sale al lobby)
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
        if (pilot.empDisabled) return;   // nave apagada por EMP
        if (player.turretCooldown > 0) return;
        player.turretCooldown = CFG.TURRET_COOLDOWN;
        // Ángulo: Capital usa turretAngles por artillero; Gunship usa turretAngle único
        const fireAngle = (pilot.shipType === "capital" && pilot.turretAngles)
          ? (pilot.turretAngles[player.id] ?? 0)
          : (pilot.turretAngle ?? 0);
        room.bullets.push({
          x: pilot.x, y: pilot.y,
          vx: Math.cos(fireAngle) * CFG.TURRET_BULLET_SPEED,
          vy: Math.sin(fireAngle) * CFG.TURRET_BULLET_SPEED,
          team: player.team, ownerId: player.id,
          damage: CFG.TURRET_DAMAGE,
        });
      } else if (player.shipType === "capital") {
        // La Capital no dispara balas: su arma principal es el rayo cargado
        // (gestionado por los mensajes "beamCharge"). Ignorar "shoot".
        return;
      } else {
        // Piloto: disparo normal
        if (player.empDisabled) return;   // nave apagada por EMP
        if (player.bulletCooldown > 0) return;
        player.bulletCooldown = CFG.BULLET_COOLDOWN;
        room.bullets.push({
          x: player.x, y: player.y,
          vx: Math.cos(player.angle) * CFG.BULLET_SPEED,
          vy: Math.sin(player.angle) * CFG.BULLET_SPEED,
          team: player.team, ownerId: player.id,
          damage: player.bulletDamage ?? CFG.BULLET_DAMAGE,
        });
      }
    }

    // ── Habilidad especial (tecla X): depende del tipo de nave
    if (msg.type === "special") {
      const room = rooms[player.roomId];
      if (!room || player.dead || player.pilotingFor || player.empDisabled) return;
      if (player.shipType === "emp") {
        if ((player.empCooldown ?? 0) > 0) return;
        player.empCooldown = CFG.EMP_PULSE_COOLDOWN;
        fireEmpPulse(player, room);
      } else if (player.shipType === "interceptor") {
        if ((player.mineCooldown ?? 0) > 0) return;
        player.mineCooldown = CFG.MINE_COOLDOWN;
        dropMine(player, room);
      }
      return;
    }

    // ── Carga del rayo de la Capital (mantener pulsado para cargar, soltar para disparar)
    if (msg.type === "beamCharge") {
      const room = rooms[player.roomId];
      if (!room || player.dead || player.pilotingFor) return;
      if (player.shipType !== "capital") return;

      if (msg.charging) {
        player.beamCharging = true;
      } else {
        // Al soltar: dispara solo si está totalmente cargado Y no es una cancelación
        // (mouseleave / pérdida de foco / muerte). Así el rayo no se dispara por un
        // release involuntario.
        player.beamCharging = false;
        if (!msg.cancel && (player.beamChargeTicks ?? 0) >= CFG.CAPITAL_BEAM_CHARGE_TIME) {
          fireCapitalBeam(player, room);
        }
        player.beamChargeTicks = 0;
        player.beamCharge = 0;
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
// Distancia mínima de un punto al segmento A→B
// Usada para colisión swept (anti-tunneling)
// ─────────────────────────────────────────────
function distToSegment(px, py, ax, ay, bx, by) {

  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Distancia mínima entre dos segmentos AB y CD (clásico segment-segment).
// Permite tratar la nave como cápsula (segmento + radio) frente al recorrido
// barrido de un proyectil, en lugar de un punto.
function segToSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
  const ux = bx - ax, uy = by - ay;
  const vx = dx - cx, vy = dy - cy;
  const wx = ax - cx, wy = ay - cy;
  const a = ux * ux + uy * uy;
  const b = ux * vx + uy * vy;
  const c = vx * vx + vy * vy;
  const d = ux * wx + uy * wy;
  const e = vx * wx + vy * wy;
  const D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c; }
  else {
    sN = b * e - c * d;
    tN = a * e - b * d;
    if (sN < 0)      { sN = 0;  tN = e;     tD = c; }
    else if (sN > sD){ sN = sD; tN = e + b; tD = c; }
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; }
  } else if (tN > tD) {
    tN = tD;
    if ((-d + b) < 0) sN = 0; else if ((-d + b) > a) sN = sD; else { sN = -d + b; sD = a; }
  }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  const px = wx + sc * ux - tc * vx;
  const py = wy + sc * uy - tc * vy;
  return Math.hypot(px, py);
}

// Cápsula de colisión de la nave en coords de mundo (segmento de proa a popa + radio).
function shipCapsule(p) {
  const ship = CFG.SHIP_TYPES[p.shipType] || CFG.SHIP_TYPES.fighter;
  const col  = ship.collider || { front: 0, rear: 0, radius: 14 };
  const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
  return {
    fx: p.x + col.front * cos, fy: p.y + col.front * sin,  // proa
    rx: p.x + col.rear  * cos, ry: p.y + col.rear  * sin,  // popa
    r:  col.radius,
  };
}

// Nave "cubierta": su posición cae dentro del radio de un asteroide flotante (z=1)
function isSheltered(px, py, asteroids) {
  return asteroids.some(a => a.z === 1 && Math.hypot(px - a.x, py - a.y) < a.r);
}

// Aplica el efecto EMP a una nave. `ticks` = duración; `disable` = si además la "apaga".
function applyEmp(target, ticks, disable) {
  target.empTimer = Math.max(target.empTimer ?? 0, ticks);
  target.empMax   = Math.max(target.empMax ?? 0, ticks);
  if (disable) target.empDisableTicks = Math.max(target.empDisableTicks ?? 0, ticks);
}

// Disparo principal de la nave Capital: un rayo instantáneo (hitscan) muy potente.
// Traza una línea desde la proa; impacta al primer enemigo en su trayectoria
// (o se detiene en un asteroide), aplica daño grande y deja un efecto visual.
function fireCapitalBeam(player, room) {
  const cos = Math.cos(player.angle), sin = Math.sin(player.angle);
  const col = (CFG.SHIP_TYPES.capital.collider) || { front: 0 };
  const ox = player.x + col.front * cos;   // origen en la proa
  const oy = player.y + col.front * sin;
  const range = CFG.CAPITAL_BEAM_RANGE;
  const ex = ox + cos * range, ey = oy + sin * range;

  // Distancia a lo largo del rayo de un punto proyectado sobre la dirección
  const along = (px, py) => (px - ox) * cos + (py - oy) * sin;

  // 1) Asteroide sólido (z=0) que bloquea el rayo más cerca
  let blockDist = range;
  for (const a of room.asteroids) {
    if (a.z !== 0) continue;
    const t = along(a.x, a.y);
    if (t < 0 || t > blockDist) continue;
    const perp = Math.hypot((ox + cos * t) - a.x, (oy + sin * t) - a.y);
    if (perp < a.r) {
      const entry = t - Math.sqrt(Math.max(0, a.r * a.r - perp * perp));
      if (entry >= 0 && entry < blockDist) blockDist = entry;
    }
  }

  // 2) Enemigo más cercano cuya cápsula intersecta el rayo dentro de blockDist
  let hitPlayer = null, hitDist = blockDist;
  for (const p of Object.values(room.players)) {
    if (p.dead || p.team === player.team || p.pilotingFor || p.id === player.id) continue;
    const cap = shipCapsule(p);
    const d = segToSegDist(ox, oy, ex, ey, cap.rx, cap.ry, cap.fx, cap.fy);
    if (d < CFG.CAPITAL_BEAM_HALFWIDTH + cap.r) {
      const t = Math.max(0, along(p.x, p.y));
      if (t <= hitDist) { hitDist = t; hitPlayer = p; }
    }
  }

  let endX, endY, didHit = false;
  if (hitPlayer) {
    endX = ox + cos * hitDist; endY = oy + sin * hitDist;
    // Cubierto bajo asteroide flotante → el rayo no daña (pero se detiene ahí)
    if (!isSheltered(hitPlayer.x, hitPlayer.y, room.asteroids)) {
      const beamAngle = Math.atan2(oy - hitPlayer.y, ox - hitPlayer.x);
      applyDamage(room, hitPlayer, CFG.CAPITAL_BEAM_DAMAGE, player, beamAngle);
      updateDamageLog(hitPlayer, player.id);
      hitPlayer.beamHit = CFG.CAPITAL_BEAM_LIFE; // marca de impacto del rayo (efecto propio, no EMP)
      didHit = true;
      if (hitPlayer.hp <= 0) killPlayer(hitPlayer, player, "beam", room);
    }
  } else {
    endX = ox + cos * blockDist; endY = oy + sin * blockDist;
  }

  room.beams.push({
    id: Date.now() + Math.random(),
    x1: ox, y1: oy, x2: endX, y2: endY,
    team: player.team, ownerId: player.id,
    hit: didHit,
    life: CFG.CAPITAL_BEAM_LIFE, maxLife: CFG.CAPITAL_BEAM_LIFE,
  });
}

// Pulso EMP en área del Disruptor: apaga a todos los enemigos dentro del radio 2-4s.
function fireEmpPulse(player, room) {
  const R = CFG.EMP_PULSE_RADIUS;
  for (const p of Object.values(room.players)) {
    if (p.dead || p.team === player.team || p.pilotingFor || p.id === player.id) continue;
    if (Math.hypot(p.x - player.x, p.y - player.y) > R) continue;
    if (isSheltered(p.x, p.y, room.asteroids)) continue;
    const dur = CFG.EMP_DISABLE_MIN +
      Math.floor(Math.random() * (CFG.EMP_DISABLE_MAX - CFG.EMP_DISABLE_MIN + 1));
    applyEmp(p, dur, true);   // apaga (motor + armas) + chispas rojas
  }
  room.empPulses.push({
    id: Date.now() + Math.random(),
    x: player.x, y: player.y, r: R, team: player.team,
    life: CFG.EMP_PULSE_LIFE, maxLife: CFG.EMP_PULSE_LIFE,
  });
}

// El Interceptor suelta una mina en su posición; explota al pasar un enemigo por encima.
function dropMine(player, room) {
  const active = room.mines.filter(m => m.ownerId === player.id).length;
  if (active >= CFG.MINE_MAX_ACTIVE) return;
  room.mines.push({
    id: Date.now() + Math.random(),
    x: player.x, y: player.y,
    team: player.team, ownerId: player.id,
    arm: CFG.MINE_ARM_TIME,        // cuenta atrás hasta armarse
    maxArm: CFG.MINE_ARM_TIME,
    life: CFG.MINE_LIFE,
    maxLife: CFG.MINE_LIFE,        // para el temporizador en cliente
  });
}

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
// Bots + oleadas (solo práctica en modo "waves")
// ─────────────────────────────────────────────

const BOT_NAMES = {
  interceptor: "INTERCEPTOR", fighter: "CAZA", bomber: "BOMBARDERO",
  gunship: "CAÑONERA", capital: "CAPITAL", emp: "DISRUPTOR",
};

// Oleadas escaladas: cada vez más naves/dureza hasta el jefe (Capital).
const WAVES = [
  { ships: ["interceptor", "interceptor"] },
  { ships: ["fighter", "fighter", "fighter"] },
  { ships: ["bomber", "fighter", "fighter"] },
  { ships: ["gunship", "interceptor", "interceptor"] },
  { ships: ["capital", "fighter", "fighter"], boss: true },
];

const TEAM_LIVES = 3;   // vidas compartidas del equipo en modo oleadas (co-op / solo)

let botCounter = 0;

// Posición de aparición de un bot: dentro del mundo y lejos de los humanos vivos.
function botSpawnPos(room) {
  const W = room.worldW, H = room.worldH;
  const humans = Object.values(room.players).filter(p => !p.isBot && !p.pilotingFor && !p.dead);
  for (let i = 0; i < 25; i++) {
    const x = W * (0.18 + Math.random() * 0.64);
    const y = H * (0.18 + Math.random() * 0.64);
    if (humans.every(h => Math.hypot(h.x - x, h.y - y) > 900)) return { x, y };
  }
  return { x: W * 0.5, y: H * 0.5 };
}

function makeBot(room, shipType) {
  const bot = createPlayer(crypto.randomUUID());
  bot.isBot = true;
  bot.name = BOT_NAMES[shipType] || "ENEMIGO";
  bot.team = "red";
  bot.shipType = shipType;
  bot.roomId = room.id;
  bot.ready = true;
  bot.dead = false;
  bot.respawnsLeft = 0;               // los bots no reaparecen
  bot.orbitSeed = (botCounter++) % 2;
  applyShipStats(bot);
  // Dificultad (configurable en caliente desde el panel admin): los bots son más
  // lentos/torpes que un humano para que sean alcanzables.
  bot.thrustVal        *= CFG.AI_SPEED_MULT ?? 0.55;
  bot.reverseThrustVal *= CFG.AI_SPEED_MULT ?? 0.55;
  bot.turnRateVal      *= CFG.AI_TURN_MULT  ?? 0.55;
  bot.aimJitter = (Math.random() - 0.5) * (CFG.AI_AIM_JITTER ?? 0.22);
  const pos = botSpawnPos(room);
  bot.x = pos.x; bot.y = pos.y;
  bot.angle = Math.random() * Math.PI * 2;
  bot.fuel = 100;
  room.players[bot.id] = bot;
  return bot;
}

function spawnWave(room, n) {
  const wave = WAVES[n - 1];
  if (!wave) return;
  const ships = [...wave.ships];
  // Escala la dificultad con el nº de jugadores humanos (co-op): naves extra por jugador
  const humans = Object.values(room.players).filter(p => !p.isBot && !p.pilotingFor).length || 1;
  for (let i = 0; i < humans - 1; i++) {
    // Jefe: más escoltas; oleadas normales: repite tipos de la oleada
    ships.push(wave.boss ? "fighter" : wave.ships[i % wave.ships.length]);
  }
  ships.forEach(t => makeBot(room, t));
}

// IA de un bot: persigue al humano más cercano, orbita a distancia y dispara.
function computeBotAI(bot, room) {
  let target = null, best = Infinity;
  for (const q of Object.values(room.players)) {
    if (q.dead || q.team === bot.team || q.pilotingFor || q.isBot) continue;
    const d = Math.hypot(q.x - bot.x, q.y - bot.y);
    if (d < best) { best = d; target = q; }
  }
  if (!target) { bot.input = { inertiaDamp: true }; bot.beamCharging = false; return; }

  const dx = target.x - bot.x, dy = target.y - bot.y;
  const dist = Math.hypot(dx, dy) || 1;
  const aim = Math.atan2(dy, dx) + bot.aimJitter;
  const input = { targetAngle: aim, inertiaDamp: true };

  const preferred = bot.shipType === "capital" ? 650 : bot.shipType === "bomber" ? 480 : 320;
  if (dist > preferred * 1.15) input.thrust = true;
  else if (dist < preferred * 0.6) input.reverse = true;
  else if (((Date.now() / 1500 | 0) + bot.orbitSeed) % 2 === 0) input.strafeLeft = true;
  else input.strafeRight = true;
  bot.input = input;

  if (bot.empDisabled) { bot.beamCharging = false; return; }

  let diff = aim - bot.angle;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const aligned = Math.abs(diff) < 0.2;

  // Capital: carga y suelta el rayo (no tiene cañón normal)
  if (bot.shipType === "capital") {
    if (aligned && dist < CFG.CAPITAL_BEAM_RANGE) {
      bot.beamCharging = true;
      if ((bot.beamChargeTicks ?? 0) >= CFG.CAPITAL_BEAM_CHARGE_TIME) {
        fireCapitalBeam(bot, room);
        bot.beamCharging = false; bot.beamChargeTicks = 0; bot.beamCharge = 0;
      }
    } else {
      bot.beamCharging = false;
    }
    return;
  }

  // Cañón
  if (aligned && dist < 720 && (bot.bulletCooldown ?? 0) <= 0) {
    bot.bulletCooldown = Math.round(CFG.BULLET_COOLDOWN * (CFG.AI_FIRE_COOLDOWN_MULT ?? 1.6));
    room.bullets.push({
      x: bot.x, y: bot.y,
      vx: Math.cos(bot.angle) * CFG.BULLET_SPEED,
      vy: Math.sin(bot.angle) * CFG.BULLET_SPEED,
      team: bot.team, ownerId: bot.id,
      damage: bot.bulletDamage ?? CFG.BULLET_DAMAGE,
    });
  }
  // Misiles ocasionales
  if (aligned && dist < 1300 && (bot.missileCooldown ?? 0) <= 0 && (bot.maxMissiles ?? 0) > 0 && Math.random() < 0.02) {
    bot.missileCooldown = bot.missileCooldownBase ?? CFG.MISSILE_COOLDOWN;
    room.missiles.push({
      id: Date.now() + Math.random(),
      x: bot.x, y: bot.y,
      vx: Math.cos(bot.angle) * CFG.MISSILE_SPEED_INIT,
      vy: Math.sin(bot.angle) * CFG.MISSILE_SPEED_INIT,
      team: bot.team, targetId: target.id, ownerId: bot.id,
      life: CFG.MISSILE_LIFE, torpedo: !!bot.firesTorpedoes,
    });
  }
}

// Gestiona la progresión de oleadas de una sala solo.
function setWaveBanner(room, text, ms = 3000) {
  room.waveBanner = text;
  room.waveBannerUntil = Date.now() + ms;
}

function manageWaves(room) {
  if (room.winner) return;

  // Derrota: equipo sin vidas compartidas y todos los humanos muertos
  const humans = Object.values(room.players).filter(p => !p.isBot && !p.pilotingFor);
  if (humans.length && (room.teamLives ?? 0) <= 0 && humans.every(p => p.dead)) {
    room.winner = "red";
    setWaveBanner(room, "DERROTA", 6000);
    return;
  }

  // Limpia bots muertos pasado un momento (deja ver la explosión)
  Object.values(room.players).forEach(p => {
    if (p.isBot && p.dead && p.deadAt && Date.now() - p.deadAt > 1500) delete room.players[p.id];
  });

  const livingBots = Object.values(room.players).filter(p => p.isBot && !p.dead).length;

  if (room.waveState === "intermission") {
    if (--room.waveTimer <= 0) {
      room.wave++;
      if (room.wave > WAVES.length) {
        room.winner = "green";              // todas las oleadas superadas
        setWaveBanner(room, "¡PRÁCTICA COMPLETADA!", 6000);
        return;
      }
      spawnWave(room, room.wave);
      room.waveState = "active";
      setWaveBanner(room, WAVES[room.wave - 1].boss ? `OLEADA ${room.wave} — ¡CAPITAL!` : `OLEADA ${room.wave}`);
    }
    return;
  }

  // active → cuando no queden bots vivos, intermedio antes de la siguiente
  if (livingBots === 0) {
    room.waveState = "intermission";
    room.waveTimer = 3 * FPS;
    setWaveBanner(room, room.wave >= WAVES.length ? "¡ÚLTIMA OLEADA SUPERADA!" : `OLEADA ${room.wave} SUPERADA`);
  }
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
        if (inp.targetAngle != null) {
          if (pilot.shipType === "capital") {
            // Capital: cada artillero tiene su propio ángulo de torreta
            if (!pilot.turretAngles) pilot.turretAngles = {};
            pilot.turretAngles[p.id] = inp.targetAngle;
          } else {
            // Gunship: torreta única del piloto
            pilot.turretAngle = inp.targetAngle;
          }
        }
        return;
      }

      // IA: fija el input del bot (y dispara) antes de aplicar el movimiento
      if (p.isBot) computeBotAI(p, room);

      p.lockedByMissile = false;
      p.lockedOnMe      = 0;

      if (p.missileCooldown > 0) p.missileCooldown--;
      if (p.bulletCooldown  > 0) p.bulletCooldown--;
      if (p.hitFlash        > 0) p.hitFlash--;
      if ((p.beamHit ?? 0)  > 0) p.beamHit--;
      // Carga del rayo de la Capital (mantener pulsado)
      if (p.shipType === "capital") {
        if (p.beamCharging) {
          p.beamChargeTicks = Math.min(CFG.CAPITAL_BEAM_CHARGE_TIME, (p.beamChargeTicks ?? 0) + 1);
        }
        p.beamCharge = (p.beamChargeTicks ?? 0) / CFG.CAPITAL_BEAM_CHARGE_TIME; // 0..1 para el cliente
      }
      // EMP: chispas rojas (visual) y apagado (motor + armas)
      if ((p.empTimer ?? 0) > 0) p.empTimer--; else p.empMax = 0;
      p.emp = (p.empMax ?? 0) > 0 ? (p.empTimer ?? 0) / p.empMax : 0; // 0..1 para el cliente
      if ((p.empDisableTicks ?? 0) > 0) p.empDisableTicks--;
      p.empDisabled = (p.empDisableTicks ?? 0) > 0;
      if ((p.empCooldown  ?? 0) > 0) p.empCooldown--;
      if ((p.mineCooldown ?? 0) > 0) p.mineCooldown--;
      if (p.shieldFlash     > 0) p.shieldFlash--;
      if (p.flaredCooldown  > 0) p.flaredCooldown--;
      // Recarga de escudo (parada mientras la nave está apagada)
      if (!p.empDisabled) {
        if ((p.shieldHitTimer ?? 99999) < (p.shieldRegenDelayTicks ?? 99999)) {
          p.shieldHitTimer++;
        } else if ((p.shield ?? 0) < (p.maxShield ?? 0)) {
          p.shield = Math.min(p.maxShield, p.shield + p.shieldRegenPerTick);
        }
      }

      // Nave apagada por EMP → sin propulsión ni giro (queda a la deriva)
      const i = p.empDisabled ? { inertiaDamp: false } : (p.input || {});

      // En DAMP con nave parada, giro hasta 1.5× más ágil
      const baseTurn = p.turnRateVal ?? CFG.TURN_RATE;
      const dampBoost = (i.inertiaDamp !== false && Math.hypot(p.vx, p.vy) < 0.8);
      const maxTurn   = dampBoost ? baseTurn * 1.5 : baseTurn;

      // Rotación: mouse aim (targetAngle) o fallback teclado
      if (i.targetAngle != null) {
        let diff = i.targetAngle - p.angle;
        while (diff >  Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        p.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
      } else {
        if (i.left)  p.angle -= maxTurn;
        if (i.right) p.angle += maxTurn;
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
        // DAMP: misma aceleración que DRIFT con motores; frena al soltarlos
        const thrusting = !!(i.thrust || i.reverse || i.strafeLeft || i.strafeRight);
        if (!thrusting) {
          p.vx *= 0.94;
          p.vy *= 0.94;
        }
      }
      // DRIFT (inertiaDamp=false): sin drag, inercia indefinida
      p.x  += p.vx;
      p.y  += p.vy;
      p.x   = Math.max(0, Math.min(room.worldW, p.x));
      p.y   = Math.max(0, Math.min(room.worldH, p.y));
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
              applyDamage(room, p, Math.floor(damage), null, impactAngle);

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
      b.x > -100 && b.x < room.worldW + 100 &&
      b.y > -100 && b.y < room.worldH + 100
    );

    for (let i = room.bullets.length - 1; i >= 0; i--) {
      const b = room.bullets[i];
      for (const p of Object.values(room.players)) {
        if (p.dead || p.team === b.team || p.pilotingFor) continue;
        // Swept test: recorrido de la bala (prev→actual) contra la cápsula del casco
        const bPrevX = b.x - b.vx, bPrevY = b.y - b.vy;
        const cap = shipCapsule(p);
        if (segToSegDist(bPrevX, bPrevY, b.x, b.y, cap.rx, cap.ry, cap.fx, cap.fy) < cap.r + CFG.BULLET_RADIUS) {
          // Nave cubierta bajo asteroide flotante → bala bloqueada por el asteroide
          if (isSheltered(p.x, p.y, room.asteroids)) { room.bullets.splice(i, 1); break; }
          const dmg = b.damage ?? CFG.BULLET_DAMAGE;
          const attacker = room.players[b.ownerId];
          const bulletAngle = Math.atan2(b.y - p.y, b.x - p.x);
          applyDamage(room, p, dmg, attacker, bulletAngle);
          //if (attacker) updateDamageLog(p, attacker.id);
          if (attacker) registerCrewDamage(p, attacker, room);
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

      // Guardar posición previa para swept collision
      m.prevX = m.x;
      m.prevY = m.y;

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
        // Swept test con posición previa guardada, contra la cápsula del casco
        const mPrevX = m.prevX ?? m.x, mPrevY = m.prevY ?? m.y;
        const cap = shipCapsule(p);
        const hitR = m.torpedo ? CFG.TORPEDO_RADIUS : CFG.MISSILE_RADIUS;
        if (segToSegDist(mPrevX, mPrevY, m.x, m.y, cap.rx, cap.ry, cap.fx, cap.fy) < cap.r + hitR) {
          // Nave cubierta bajo asteroide flotante → misil bloqueado
          if (isSheltered(p.x, p.y, room.asteroids)) { room.missiles.splice(i, 1); break; }
          const attacker = room.players[m.ownerId];
          const missileAngle = Math.atan2(m.y - p.y, m.x - p.x);
          const dmg = m.torpedo ? CFG.TORPEDO_DAMAGE : CFG.MISSILE_DAMAGE;
          applyDamage(room, p, dmg, attacker, missileAngle);
          //if (attacker) updateDamageLog(p, attacker.id);
          if (attacker) registerCrewDamage(p, attacker, room);
          if (p.hp <= 0) killPlayer(p, attacker || null, m.torpedo ? "torpedo" : "missile", room);
          room.missiles.splice(i, 1);
          break;
        }
      }
    }

    // ── Beams (rayo de la Capital): solo efecto visual, el daño ya se aplicó al disparar
    room.beams = (room.beams || []).filter(b => { b.life--; return b.life > 0; });

    // ── Ondas EMP (solo visual; el apagado ya se aplicó al disparar)
    room.empPulses = (room.empPulses || []).filter(e => { e.life--; return e.life > 0; });

    // ── Minas: se arman, expiran y explotan al pasar un enemigo por encima
    for (let i = room.mines.length - 1; i >= 0; i--) {
      const mine = room.mines[i];
      if (mine.arm > 0) mine.arm--;
      mine.life--;
      if (mine.life <= 0) { room.mines.splice(i, 1); continue; }
      if (mine.arm > 0) continue;   // aún no armada
      // ¿Enemigo dentro del radio de disparo?
      const trigger = Object.values(room.players).find(p =>
        !p.dead && p.team !== mine.team && !p.pilotingFor &&
        Math.hypot(p.x - mine.x, p.y - mine.y) <= CFG.MINE_TRIGGER_RADIUS);
      if (!trigger) continue;
      // Explosión: daño en área que decae con la distancia
      const attacker = room.players[mine.ownerId];
      for (const p of Object.values(room.players)) {
        if (p.dead || p.team === mine.team || p.pilotingFor) continue;
        const dist = Math.hypot(p.x - mine.x, p.y - mine.y);
        if (dist > CFG.MINE_BLAST_RADIUS) continue;
        const dmg = CFG.MINE_DAMAGE * (1 - dist / CFG.MINE_BLAST_RADIUS);
        const ang = Math.atan2(mine.y - p.y, mine.x - p.x);
        applyDamage(room, p, dmg, attacker, ang);
        //if (attacker) updateDamageLog(p, attacker.id);
        if (attacker) registerCrewDamage(p, attacker, room);
        if (p.hp <= 0) killPlayer(p, attacker || null, "mine", room);
      }
      // Marca para efecto visual de explosión (reutiliza empPulses en blanco/naranja)
      room.empPulses.push({
        id: Date.now() + Math.random(),
        x: mine.x, y: mine.y, r: CFG.MINE_BLAST_RADIUS, team: mine.team,
        life: CFG.EMP_PULSE_LIFE, maxLife: CFG.EMP_PULSE_LIFE, blast: true,
      });
      room.mines.splice(i, 1);
    }

    // ── Flares
    room.flare = (room.flare || []).filter(f => { f.life--; return f.life > 0; });

    // ── Oleadas (solo práctica)
    if (room.waveMode) manageWaves(room);

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
      beams:     room.beams || [],
      empPulses: room.empPulses || [],
      mines:     room.mines || [],
      flare:     room.flare || [],
      asteroids: room.asteroids,
      winner:    room.winner,
      killFeed:  room.killFeed,
      timeLeft:  Math.max(0, Math.ceil(room.timeLeft / FPS)),
      world:     { width: room.worldW, height: room.worldH },
      // Modo oleadas (solo práctica)
      solo:      !!room.solo,
      waveMode:  !!room.waveMode,
      teamLives: room.waveMode ? (room.teamLives ?? 0) : null,
      wave:      room.wave || 0,
      waveTotal: WAVES.length,
      enemiesLeft: room.waveMode ? Object.values(room.players).filter(p => p.isBot && !p.dead).length : 0,
      waveBanner: (room.waveMode && room.waveBannerUntil > Date.now()) ? room.waveBanner : null,
    });
  });
}

setInterval(update, 1000 / FPS);
