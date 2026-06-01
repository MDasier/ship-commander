const WebSocket = require("ws");
const crypto    = require("crypto");
const http      = require("http");
const fs        = require("fs");
const path      = require("path");
const CFG       = require("./config");

const WORLD_W = 3000;
const WORLD_H = 3000;
const FPS     = 30;
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

function createRoom(ownerId) {
  const id = crypto.randomUUID();
  rooms[id] = {
    id,
    status: "waiting",
    ownerId,
    players: {},
    bullets: [],
    missiles: [],
    flare: [],
    asteroids: [
      { x: 1000, y: 900,  r: 80  },
      { x: 1700, y: 1200, r: 120 },
      { x: 2100, y: 1800, r: 60  },
      { x: 1300, y: 2200, r: 100 }
    ],
    winner:  null,
    killFeed: [],
    timeLeft: 0
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

  let green = 0, red = 0;
  Object.values(room.players).forEach(p => {
    p.dead  = false;
    p.fuel  = 100;
    p.vx    = 0;
    p.vy    = 0;
    p.angle = 0;
    applyShipStats(p); // sets hp, maxHp, thrustVal, etc.

    if (green <= red) {
      p.team = "green";
      p.x = 300  + Math.random() * 200;
      p.y = 1000 + Math.random() * 500;
      green++;
    } else {
      p.team = "red";
      p.x = 2500 + Math.random() * 200;
      p.y = 1000 + Math.random() * 500;
      red++;
    }
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
  });

  broadcastRoom(room, { type: "roomRestarted", room });
}

function removeFromRoom(player) {
  if (!player.roomId) return;
  const room = rooms[player.roomId];
  if (!room) return;

  delete room.players[player.id];
  player.roomId = null;

  if (Object.keys(room.players).length === 0) {
    delete rooms[room.id];
  } else {
    broadcastRoom(room, { type: "roomUpdate", room });
  }
}

function roomList() {
  return Object.values(rooms).map(r => ({
    id:      r.id,
    players: Object.keys(r.players).length,
    status:  r.status
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

  send(ws, { type: "init", id });
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

    if (msg.type === "leaveRoom") { removeFromRoom(player); return; }

    if (msg.type === "createRoom") {
      const room = createRoom(id);
      joinRoom(player, room);
      send(ws, { type: "roomJoined", roomId: room.id });
      broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "joinRoom") {
      const room = rooms[msg.roomId];
      if (!room) return;
      if (room.status !== "waiting") return;
      if (Object.keys(room.players).length >= 6) return;
      joinRoom(player, room);
      send(ws, { type: "roomJoined", roomId: room.id });
      broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "ready") {
      const room = rooms[player.roomId];
      if (!room || room.status !== "waiting") return;

      player.ready = !player.ready;
      broadcastRoom(room, { type: "roomUpdate", room });

      const list = Object.values(room.players);
      if (list.length >= 1 && list.every(p => p.ready)) startGame(room);
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
      broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "selectShip") {
      const room = rooms[player.roomId];
      if (!room || room.status !== "waiting") return;
      if (!CFG.SHIP_TYPES[msg.shipType]) return;
      player.shipType = msg.shipType;
      broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if (msg.type === "input") { player.input = msg; return; }

    if (msg.type === "flare") {
      const room = rooms[player.roomId];
      if (!room || player.flaredCooldown > 0) return;
      room.flare = room.flare || [];
      room.flare.push({ x: player.x, y: player.y, life: CFG.FLARE_LIFE, team: player.team });
      player.flaredCooldown = CFG.FLARE_COOLDOWN;
    }

    if (msg.type === "missile") {
      const room = rooms[player.roomId];
      if (!room || player.dead) return;
      if (player.missileCooldown > 0) return;
      const active = room.missiles.filter(m => m.ownerId === player.id).length;
      if (active >= (player.maxMissiles ?? CFG.MISSILE_MAX_ACTIVE)) return;

      room.missiles.push({
        x:        player.x,
        y:        player.y,
        vx:       Math.cos(player.angle) * CFG.MISSILE_SPEED_INIT,
        vy:       Math.sin(player.angle) * CFG.MISSILE_SPEED_INIT,
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
      player.dead = true;
      player.hp   = 0;
      player.deaths++;
      room.shipsDestroyed = true;
      pushKill(room, null, player, "self");
      return;
    }

    if (msg.type === "restartGame") {
      const room = rooms[player.roomId];
      if (!room || room.ownerId !== player.id || room.status !== "playing") return;
      restartRoom(room);
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
      if (!room || player.dead || player.bulletCooldown > 0) return;
      player.bulletCooldown = CFG.BULLET_COOLDOWN;
      room.bullets.push({
        x:  player.x,
        y:  player.y,
        vx: Math.cos(player.angle) * CFG.BULLET_SPEED,
        vy: Math.sin(player.angle) * CFG.BULLET_SPEED,
        team:    player.team,
        ownerId: player.id
      });
    }
  });

  ws.on("close", () => {
    removeFromRoom(player);
    clients.delete(id);
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
      p.lockedByMissile = false;
      p.lockedOnMe      = 0;

      if (p.missileCooldown > 0) p.missileCooldown--;
      if (p.bulletCooldown  > 0) p.bulletCooldown--;
      if (p.hitFlash        > 0) p.hitFlash--;
      if (p.flaredCooldown  > 0) p.flaredCooldown--;

      const i = p.input || {};
      if (i.left)  p.angle -= (p.turnRateVal    ?? CFG.TURN_RATE);
      if (i.right) p.angle += (p.turnRateVal    ?? CFG.TURN_RATE);

      if (i.thrust && p.fuel > 0) {
        p.vx  += Math.cos(p.angle) * (p.thrustVal        ?? CFG.THRUST);
        p.vy  += Math.sin(p.angle) * (p.thrustVal        ?? CFG.THRUST);
        p.fuel = Math.max(0, p.fuel - CFG.THRUST_FUEL);
      } else if (i.reverse && p.fuel > 0) {
        p.vx  -= Math.cos(p.angle) * (p.reverseThrustVal ?? CFG.REVERSE_THRUST);
        p.vy  -= Math.sin(p.angle) * (p.reverseThrustVal ?? CFG.REVERSE_THRUST);
        p.fuel = Math.max(0, p.fuel - CFG.REVERSE_FUEL);
      } else if (p.fuel < 100) {
        p.fuel = Math.min(100, p.fuel + (p.fuelRegenVal  ?? CFG.FUEL_REGEN));
      }

      p.vx *= (p.dragVal ?? CFG.DRAG);
      p.vy *= (p.dragVal ?? CFG.DRAG);
      p.x  += p.vx;
      p.y  += p.vy;
      p.x   = Math.max(0, Math.min(WORLD_W, p.x));
      p.y   = Math.max(0, Math.min(WORLD_H, p.y));
    });

    // ── Asteroid collision
    Object.values(room.players).forEach(p => {
      if (p.dead) return;
      for (const ast of room.asteroids) {
        const dx   = p.x - ast.x;
        const dy   = p.y - ast.y;
        const dist = Math.hypot(dx, dy);
        const min  = ast.r + 14;
        if (dist < min) {
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          p.x  = ast.x + nx * min;
          p.y  = ast.y + ny * min;
          const impact = Math.hypot(p.vx, p.vy);
          p.vx *= -0.4;
          p.vy *= -0.4;
          if (impact > CFG.ASTEROID_IMPACT_MIN) {
            p.hp -= Math.floor(impact * CFG.ASTEROID_DAMAGE_FACTOR);
            p.hitFlash = 8;
            if (p.hp <= 0) {
              p.hp   = 0;
              p.dead = true;
              p.deaths++;
              room.shipsDestroyed = true;
              pushKill(room, null, p, "asteroid");
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
        if (p.dead || p.team === b.team) continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) < CFG.BULLET_RADIUS) {
          p.hp -= CFG.BULLET_DAMAGE;
          p.hitFlash = 8;
          if (p.hp <= 0) {
            p.dead = true; p.hp = 0; p.deaths++;
            room.shipsDestroyed = true;
            const killer = room.players[b.ownerId];
            if (killer && killer.id !== p.id) killer.kills++;
            pushKill(room, killer || null, p, "bullet");
          }
          room.bullets.splice(i, 1);
          break;
        }
      }
    }

    // ── Missiles
    room.missiles.forEach(m => {
      const target = room.players[m.targetId];
      if (target && !target.dead) {
        target.lockedByMissile = true;
        target.lockedOnMe++;
      }

      const flares     = room.flare || [];
      let   distracted = false;
      for (const f of flares) {
        if (Math.hypot(m.x - f.x, m.y - f.y) < CFG.FLARE_RADIUS) {
          steerMissile(m, f.x, f.y, CFG.FLARE_TURN, CFG.FLARE_THRUST);
          distracted = true;
          break;
        }
      }

      if (!distracted && target && !target.dead) {
        steerMissile(m, target.x, target.y, CFG.MISSILE_TURN, CFG.MISSILE_THRUST);
      }

      m.x += m.vx;
      m.y += m.vy;
      m.life--;
    });

    room.missiles = room.missiles.filter(m => m.life > 0);

    for (let i = room.missiles.length - 1; i >= 0; i--) {
      const m = room.missiles[i];
      for (const p of Object.values(room.players)) {
        if (p.dead || p.team === m.team) continue;
        if (Math.hypot(p.x - m.x, p.y - m.y) < CFG.MISSILE_RADIUS) {
          p.hp -= CFG.MISSILE_DAMAGE;
          p.hitFlash = 8;
          if (p.hp <= 0) {
            p.hp = 0; p.dead = true; p.deaths++;
            room.shipsDestroyed = true;
            const killer = room.players[m.ownerId];
            if (killer && killer.id !== p.id) killer.kills++;
            pushKill(room, killer || null, p, "missile");
          }
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
        if (greenAlive === 0) room.winner = "red";
        if (redAlive   === 0) room.winner = "green";
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
          else                            room.winner = "draw";
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
