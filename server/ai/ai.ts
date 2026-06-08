// IA de los bots (jugadores con isBot). Los bots NO tienen código en el cliente:
// una rutina de IA fija su `input` y luego corre la misma física que un humano.
// Aquí viven la creación de bots, los helpers de comportamiento y computeBotAI.

const crypto = require("crypto");
const CFG = require("../config");
const { BOT_NAMES } = require("../constants.ts");
const { createPlayer, applyShipStats } = require("../entities/player.ts");
const { fireCapitalBeam } = require("../sim/weapons.ts");

// ─────────────────────────────────────────────────────────────
// BOT SPAWN
// ─────────────────────────────────────────────────────────────

// Posición de aparición de un bot: dentro del mundo y lejos de los humanos vivos.
function botSpawnPos(room: Room): Vec2 {
  const W = room.worldW, H = room.worldH;
  const humans = Object.values(room.players).filter(p => !p.isBot && !p.pilotingFor && !p.dead);

  for (let i = 0; i < 25; i++) {
    const x = W * (0.18 + Math.random() * 0.64);
    const y = H * (0.18 + Math.random() * 0.64);
    if (humans.every(h => Math.hypot(h.x - x, h.y - y) > 900)) return { x, y };
  }

  return { x: W * 0.5, y: H * 0.5 };
}

// ─────────────────────────────────────────────────────────────
// BOT CREATION
// ─────────────────────────────────────────────────────────────

function makeBot(room: Room, shipType: string): Player {
  const bot = createPlayer(crypto.randomUUID());
  bot.isBot = true;
  bot.name = BOT_NAMES[shipType] || "ENEMIGO";
  bot.team = "red";
  bot.shipType = shipType;
  bot.roomId = room.id;
  bot.ready = true;
  bot.dead = false;
  bot.respawnsLeft = 0;

  applyShipStats(bot);

  bot.thrustVal        *= CFG.AI_SPEED_MULT ?? 0.55;
  bot.reverseThrustVal *= CFG.AI_SPEED_MULT ?? 0.55;
  bot.turnRateVal      *= CFG.AI_TURN_MULT  ?? 0.55;

  bot.aimJitter = (Math.random() - 0.5) * (CFG.AI_AIM_JITTER ?? 0.22);

  const pos = botSpawnPos(room);
  bot.x = pos.x;
  bot.y = pos.y;
  bot.angle = Math.random() * Math.PI * 2;
  bot.fuel = 100;

  // memoria táctica
  bot.orbitDir = Math.random() < 0.5 ? -1 : 1;
  bot.attackPhase = "approach";
  bot.phaseUntil = Date.now() + (CFG.AI_ATTACK_RUN_TIME ?? 2600);

  bot.distTarget =
    (shipType === "bomber" || shipType === "gunship" || shipType === "capital")
      ? (900 + Math.random() * 500)
      : (520 + Math.random() * 320);

  // ── NUEVO: FSM global + patrulla
  bot.mode = "patrol"; // patrol | engage | retreat
  bot.waypoint = null;
  bot.waypointUntil = 0;

  room.players[bot.id] = bot;
  return bot;
}

// ─────────────────────────────────────────────────────────────
// WORLD AVOIDANCE
// ─────────────────────────────────────────────────────────────

function applyWorldBoundaryAvoidance(bot: Player, room: Room): void {
  const margin = room.worldW * 0.25;

  let ax = 0;
  let ay = 0;

  if (bot.x < margin) ax += (margin - bot.x) * 0.00035;
  else if (bot.x > room.worldW - margin) ax -= (bot.x - (room.worldW - margin)) * 0.00035;

  if (bot.y < margin) ay += (margin - bot.y) * 0.00035;
  else if (bot.y > room.worldH - margin) ay -= (bot.y - (room.worldH - margin)) * 0.00035;

  bot.vx += ax;
  bot.vy += ay;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function botHealthFrac(bot: Player): number {
  const maxTotal = (bot.maxHp || 1) + (bot.maxShield || 0);
  return ((bot.hp || 0) + Math.max(0, bot.shield || 0)) / maxTotal;
}

function incomingMissileNear(bot: Player, room: Room, radius: number): Missile | null {
  let nearest: Missile | null = null, best = radius;

  for (const m of room.missiles || []) {
    if (m.team === bot.team) continue;
    const d = Math.hypot(m.x - bot.x, m.y - bot.y);
    const threatens = m.targetId === bot.id || d < radius * 0.55;
    if (threatens && d < best) {
      best = d;
      nearest = m;
    }
  }
  return nearest;
}

function nearestAlly(bot: Player, room: Room): Player | null {
  let ally: Player | null = null, best = Infinity;

  for (const q of Object.values(room.players)) {
    if (q.id === bot.id || q.dead || q.team !== bot.team || q.pilotingFor) continue;
    const d = Math.hypot(q.x - bot.x, q.y - bot.y);
    if (d < best) {
      best = d;
      ally = q;
    }
  }
  return ally;
}

function botDeployFlare(bot: Player, room: Room): void {
  if ((bot.flaresLeft ?? 0) <= 0 || (bot.flaredCooldown ?? 0) > 0 || bot.empDisabled) return;

  room.flare = room.flare || [];
  room.flare.push({
    id: Date.now() + Math.random(),
    x: bot.x,
    y: bot.y,
    life: CFG.FLARE_LIFE,
    team: bot.team as Team
  });

  bot.flaredCooldown = CFG.FLARE_COOLDOWN;
  bot.flaresLeft = Math.max(0, bot.flaresLeft! - 1);
}

function steerAroundAsteroids(bot: Player, room: Room, ang: number): number {
  const asts = room.asteroids || [];
  if (!asts.length) return ang;

  const myR = (CFG.SHIP_TYPES[bot.shipType]?.collider?.radius) || 20;
  const speed = Math.hypot(bot.vx, bot.vy);
  const look = 200 + speed * 16;

  let rx = 0, ry = 0;

  for (const a of asts) {
    if (a.z !== 0) continue;

    const ox = bot.x - a.x;
    const oy = bot.y - a.y;
    const d = Math.hypot(ox, oy) || 0.01;

    const safe = (a.r || 40) + myR + 60;

    if (d < safe + look) {
      const w = Math.max(0, (safe + look - d)) / (safe + look);
      rx += (ox / d) * w * w;
      ry += (oy / d) * w * w;
    }
  }

  if (rx === 0 && ry === 0) return ang;

  const mx = Math.cos(ang) + rx * 2.2;
  const my = Math.sin(ang) + ry * 2.2;

  return Math.atan2(my, mx);
}

// ─────────────────────────────────────────────────────────────
// FORMATION + PATROL
// ─────────────────────────────────────────────────────────────

function generatePatrolPoint(room: Room): Vec2 {
  return {
    x: room.worldW * (0.15 + Math.random() * 0.7),
    y: room.worldH * (0.15 + Math.random() * 0.7),
  };
}

function botPatrolFormation(bot: Player, room: Room, objective: Vec2): void {
  const squad = Object.values(room.players)
    .filter(p => p.isBot && !p.dead && !p.pilotingFor)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const n = squad.length || 1;
  const idx = Math.max(0, squad.findIndex(p => p.id === bot.id));

  const cx = squad.reduce((s, p) => s + p.x, 0) / n;
  const cy = squad.reduce((s, p) => s + p.y, 0) / n;

  const heading = Math.atan2(objective.y - cy, objective.x - cx);

  const spacing = CFG.AI_FORMATION_SPACING ?? 150;
  const off = (idx - (n - 1) / 2) * spacing;
  const advance = 300;

  const slotX = cx + Math.cos(heading) * advance + Math.cos(heading + Math.PI / 2) * off;
  const slotY = cy + Math.sin(heading) * advance + Math.sin(heading + Math.PI / 2) * off;

  const d = Math.hypot(slotX - bot.x, slotY - bot.y);
  const ang = Math.atan2(slotY - bot.y, slotX - bot.x);

  bot.input = {
    targetAngle: d > 80 ? ang : heading,
    thrust: d > 80,
    inertiaDamp: true,
  };

  bot.beamCharging = false;
}

// ─────────────────────────────────────────────────────────────
// MAIN AI
// ─────────────────────────────────────────────────────────────

function computeBotAI(bot: Player, room: Room): void {

  const target = room.players[bot.currentTargetId as string];

  if (!target || target.dead || Math.random() < 0.008) {
    let best = Infinity;
    let newT: Player | null = null;

    for (const q of Object.values(room.players)) {
      if (q.dead || q.team === bot.team || q.pilotingFor || q.isBot) continue;
      const d = Math.hypot(q.x - bot.x, q.y - bot.y);
      if (d < best) {
        best = d;
        newT = q;
      }
    }

    bot.currentTargetId = newT ? newT.id : null;
  }

  const enemy = room.players[bot.currentTargetId as string];

  if (!enemy || enemy.dead || bot.empDisabled) {
    bot.input = { inertiaDamp: true };
    bot.beamCharging = false;
    return;
  }

  const dist = Math.hypot(enemy.x - bot.x, enemy.y - bot.y);
  const health = botHealthFrac(bot);

  const ally = nearestAlly(bot, room);

  // ── MODE FSM ─────────────────────────────
  if (health < 0.30) bot.mode = "retreat";
  else if (dist < (CFG.AI_DETECT_RANGE ?? 1600)) bot.mode = "engage";
  else bot.mode = "patrol";

  const FIRE_RANGE = 850;

  // ── PATROL ───────────────────────────────
  if (bot.mode === "patrol") {

    if (!bot.waypoint || Date.now() > bot.waypointUntil) {
      bot.waypoint = generatePatrolPoint(room);
      bot.waypointUntil = Date.now() + 8000 + Math.random() * 4000;
    }

    botPatrolFormation(bot, room, bot.waypoint);
    return;
  }

  // ── RETREAT ──────────────────────────────
  if (bot.mode === "retreat") {
    const safeX = ally ? ally.x : room.worldW / 2;
    const safeY = ally ? ally.y : room.worldH / 2;

    const ang = Math.atan2(safeY - bot.y, safeX - bot.x);

    bot.input = {
      targetAngle: ang,
      thrust: true,
      inertiaDamp: true
    };

    return;
  }

  // ── MISSILE DEFENSE ──────────────────────
  const missile = incomingMissileNear(bot, room, (CFG.FLARE_RADIUS ?? 200) * 2.2);

  if (missile) {
    if ((bot.flaresLeft ?? 0) > 0) {
      botDeployFlare(bot, room);
    } else {
      const away = Math.atan2(bot.y - missile.y, bot.x - missile.x);
      const safe = steerAroundAsteroids(bot, room, away);

      bot.input = {
        targetAngle: safe,
        thrust: true,
        inertiaDamp: true
      };
      return;
    }
  }

  // ── LEAD AIM ─────────────────────────────
  const projSpeed = bot.shipType === "capital" ? 1e9 : (CFG.BULLET_SPEED || 10);
  const t = Math.min(dist / projSpeed, 60);

  const aimX = enemy.x + (enemy.vx || 0) * t;
  const aimY = enemy.y + (enemy.vy || 0) * t;

  const leadAngle = Math.atan2(aimY - bot.y, aimX - bot.x) + (bot.aimJitter ?? 0);

  const diff = Math.atan2(Math.sin(leadAngle - bot.angle), Math.cos(leadAngle - bot.angle));
  const aligned = Math.abs(diff) < (CFG.AI_FIRE_CONE ?? 0.16);

  const lowHealth = health < (CFG.AI_REGROUP_HEALTH_FRAC ?? 0.35);

  // ── MOVEMENT ENGAGE ──────────────────────
  const standoff = (bot.shipType === "bomber" || bot.shipType === "gunship" || bot.shipType === "capital");

  if (lowHealth) {
    const flee = Math.atan2(bot.y - enemy.y, bot.x - enemy.x);

    bot.input = {
      targetAngle: flee,
      thrust: true,
      inertiaDamp: true
    };

  } else if (standoff) {

    const band = 170;
    const input: PlayerInput = { targetAngle: leadAngle, inertiaDamp: true };

    if (dist > bot.distTarget! + band) input.thrust = true;
    else if (dist < bot.distTarget! - band) input.reverse = true;

    bot.input = input;

  } else {

    if (dist > FIRE_RANGE) {
      bot.input = {
        targetAngle: leadAngle,
        thrust: true,
        inertiaDamp: true
      };
    } else {
      bot.input = {
        targetAngle: leadAngle,
        thrust: false,
        inertiaDamp: true
      };
    }
  }

  // ── COMBAT ───────────────────────────────

  if (bot.shipType === "capital") {
    if (aligned && dist < CFG.CAPITAL_BEAM_RANGE) {
      bot.beamCharging = true;

      if ((bot.beamChargeTicks ?? 0) >= CFG.CAPITAL_BEAM_CHARGE_TIME) {
        fireCapitalBeam(bot, room);
        bot.beamChargeTicks = 0;
        bot.beamCharging = false;
      }
    } else {
      bot.beamCharging = false;
    }
    return;
  }

  if (aligned && dist < FIRE_RANGE && (bot.bulletCooldown ?? 0) <= 0) {
    bot.bulletCooldown = Math.round(CFG.BULLET_COOLDOWN * 1.5);

    room.bullets.push({
      x: bot.x,
      y: bot.y,
      vx: Math.cos(bot.angle) * CFG.BULLET_SPEED,
      vy: Math.sin(bot.angle) * CFG.BULLET_SPEED,
      team: bot.team as Team,
      ownerId: bot.id,
      damage: bot.bulletDamage ?? CFG.BULLET_DAMAGE,
    });
  }

  const missileChance =
    (CFG.AI_MISSILE_CHANCE ?? 0.012) *
    (bot.shipType === "bomber" ? 4 : 1);

  if (
    !lowHealth &&
    Math.abs(diff) < (CFG.AI_FIRE_CONE ?? 0.16) * 2.5 &&
    dist < 1300 &&
    (bot.missileCooldown ?? 0) <= 0 &&
    (bot.maxMissiles ?? 0) > 0 &&
    Math.random() < missileChance
  ) {
    bot.missileCooldown = bot.missileCooldownBase ?? CFG.MISSILE_COOLDOWN;

    room.missiles.push({
      id: Date.now() + Math.random(),
      x: bot.x,
      y: bot.y,
      vx: Math.cos(bot.angle) * CFG.MISSILE_SPEED_INIT,
      vy: Math.sin(bot.angle) * CFG.MISSILE_SPEED_INIT,
      team: bot.team as Team,
      targetId: enemy.id,
      ownerId: bot.id,
      life: CFG.MISSILE_LIFE,
      torpedo: !!bot.firesTorpedoes,
    });
  }
}

module.exports = {
  botSpawnPos,
  makeBot,
  applyWorldBoundaryAvoidance,
  botHealthFrac,
  incomingMissileNear,
  nearestAlly,
  botDeployFlare,
  steerAroundAsteroids,
  botPatrolFormation,
  computeBotAI,
};