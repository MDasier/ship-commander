// IA de los bots (jugadores con isBot). Los bots NO tienen código en el cliente:
// una rutina de IA fija su `input` y luego corre la misma física que un humano.
// Aquí viven la creación de bots, los helpers de comportamiento y computeBotAI.

const crypto = require("crypto");
const CFG = require("../config");
const { BOT_NAMES } = require("../constants.ts");
const { createPlayer, applyShipStats } = require("../entities/player.ts");
const { fireCapitalBeam } = require("../sim/weapons.ts");

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

  // memoria de comportamiento (pasadas de ataque)
  bot.orbitDir = Math.random() < 0.5 ? -1 : 1;
  bot.attackPhase = "approach";              // "approach" | "break"
  bot.phaseUntil = Date.now() + (CFG.AI_ATTACK_RUN_TIME ?? 2600);
  // distancia de combate preferida según el rol de la nave
  const standoff = (shipType === "bomber" || shipType === "gunship" || shipType === "capital");
  bot.distTarget = standoff ? (900 + Math.random() * 500) : (520 + Math.random() * 320);

  room.players[bot.id] = bot;
  return bot;
}

function applyWorldBoundaryAvoidance(bot: Player, room: Room): void {
  const margin = room.worldW * 0.25;

  let ax = 0;
  let ay = 0;

  // ── soft edge avoidance (solo cerca del borde)
  if (bot.x < margin) {
    ax += (margin - bot.x) * 0.00035;
  } else if (bot.x > room.worldW - margin) {
    ax -= (bot.x - (room.worldW - margin)) * 0.00035;
  }

  if (bot.y < margin) {
    ay += (margin - bot.y) * 0.00035;
  } else if (bot.y > room.worldH - margin) {
    ay -= (bot.y - (room.worldH - margin)) * 0.00035;
  }

  // ── aplicar como steering suave
  bot.vx += ax;
  bot.vy += ay;
}

// ── Helpers de IA ────────────────────────────────────────────
function botHealthFrac(bot: Player): number {
  const maxTotal = (bot.maxHp || 1) + (bot.maxShield || 0);
  return ((bot.hp || 0) + Math.max(0, bot.shield || 0)) / maxTotal;
}

// Misil hostil más cercano que amenaza al bot (lo persigue o pasa muy cerca).
function incomingMissileNear(bot: Player, room: Room, radius: number): Missile | null {
  let nearest: Missile | null = null, best = radius;
  for (const m of room.missiles || []) {
    if (m.team === bot.team) continue;
    const d = Math.hypot(m.x - bot.x, m.y - bot.y);
    const threatens = m.targetId === bot.id || d < radius * 0.55;
    if (threatens && d < best) { best = d; nearest = m; }
  }
  return nearest;
}

// Aliado vivo más cercano (otro bot del mismo equipo) para reagruparse.
function nearestAlly(bot: Player, room: Room): Player | null {
  let ally: Player | null = null, best = Infinity;
  for (const q of Object.values(room.players)) {
    if (q.id === bot.id || q.dead || q.team !== bot.team || q.pilotingFor) continue;
    const d = Math.hypot(q.x - bot.x, q.y - bot.y);
    if (d < best) { best = d; ally = q; }
  }
  return ally;
}

// El bot suelta una bengala si tiene pool y cooldown disponibles.
function botDeployFlare(bot: Player, room: Room): void {
  if ((bot.flaresLeft ?? 0) <= 0 || (bot.flaredCooldown ?? 0) > 0 || bot.empDisabled) return;
  room.flare = room.flare || [];
  room.flare.push({ id: Date.now() + Math.random(), x: bot.x, y: bot.y, life: CFG.FLARE_LIFE, team: bot.team as Team });
  bot.flaredCooldown = CFG.FLARE_COOLDOWN;
  bot.flaresLeft = Math.max(0, bot.flaresLeft! - 1);
}

// Ajusta un ángulo de rumbo deseado para esquivar asteroides sólidos (z===0).
// Suma una repulsión de los asteroides cercanos al vector de rumbo y lo renormaliza,
// mirando más lejos cuanto más rápido va el bot.
function steerAroundAsteroids(bot: Player, room: Room, ang: number): number {
  const asts = room.asteroids || [];
  if (!asts.length) return ang;

  const myR = (CFG.SHIP_TYPES[bot.shipType]?.collider?.radius) || 20;
  const speed = Math.hypot(bot.vx, bot.vy);
  const look = 200 + speed * 16;        // distancia de anticipación

  let rx = 0, ry = 0;
  for (const a of asts) {
    if (a.z !== 0) continue;            // solo los sólidos chocan
    const ox = bot.x - a.x, oy = bot.y - a.y;
    const d = Math.hypot(ox, oy) || 0.01;
    const safe = (a.r || 40) + myR + 60;
    if (d < safe + look) {
      const w = Math.max(0, (safe + look - d)) / (safe + look);
      rx += (ox / d) * w * w;          // peso cuadrático → reacciona fuerte de cerca
      ry += (oy / d) * w * w;
    }
  }
  if (rx === 0 && ry === 0) return ang;

  const mx = Math.cos(ang) + rx * 2.2;
  const my = Math.sin(ang) + ry * 2.2;
  return Math.atan2(my, mx);
}

// Patrulla en formación: cuando no hay jugadores cerca, los bots avanzan juntos
// hacia el objetivo en línea (frente abierto), manteniendo separación lateral.
function botPatrolFormation(bot: Player, room: Room, objective: Vec2): void {
  const squad = Object.values(room.players)
    .filter(p => p.isBot && !p.dead && !p.pilotingFor)
    .sort((a, b) => (a.id < b.id ? -1 : 1));   // orden estable → slots consistentes
  const n = squad.length || 1;
  const idx = Math.max(0, squad.findIndex(p => p.id === bot.id));

  // Centroide del escuadrón y rumbo común hacia el objetivo
  const cx = squad.reduce((s, p) => s + p.x, 0) / n;
  const cy = squad.reduce((s, p) => s + p.y, 0) / n;
  const heading = Math.atan2(objective.y - cy, objective.x - cx);

  // Slot lateral perpendicular al rumbo (formación en línea / frente)
  const spacing = CFG.AI_FORMATION_SPACING ?? 150;
  const off = (idx - (n - 1) / 2) * spacing;
  const advance = 300;   // el grupo avanza un poco por delante del centroide
  const slotX = cx + Math.cos(heading) * advance + Math.cos(heading + Math.PI / 2) * off;
  const slotY = cy + Math.sin(heading) * advance + Math.sin(heading + Math.PI / 2) * off;

  const d = Math.hypot(slotX - bot.x, slotY - bot.y);
  const ang = Math.atan2(slotY - bot.y, slotX - bot.x);
  // Si ya está en su slot, encara el rumbo del grupo (formación alineada) sin acelerar
  bot.input = {
    targetAngle: d > 80 ? ang : heading,
    thrust: d > 80,
    inertiaDamp: true,
  };
  bot.beamCharging = false;
}

// IA de un bot: busca al humano más cercano, hace pasadas de ataque con puntería
// predictiva, dispara con mesura, suelta bengalas defensivas y se reagrupa si está herido.
function computeBotAI(bot: Player, room: Room): void {
  // 1. Target persistente (re-evalúa de vez en cuando o si el objetivo murió)
  const cur = room.players[bot.currentTargetId as string];
  if (!cur || cur.dead || Math.random() < 0.008) {
    let target: Player | null = null, best = Infinity;
    for (const q of Object.values(room.players)) {
      if (q.dead || q.team === bot.team || q.pilotingFor || q.isBot) continue;
      const d = Math.hypot(q.x - bot.x, q.y - bot.y);
      if (d < best) { best = d; target = q; }
    }
    bot.currentTargetId = target ? target.id : null;
  }

  const target = room.players[bot.currentTargetId as string];
  if (!target || target.dead) {
    bot.input = { inertiaDamp: true };   // sin objetivo: deriva suavemente
    bot.beamCharging = false;
    return;
  }
  if (bot.empDisabled) {
    bot.input = { inertiaDamp: true };
    bot.beamCharging = false;
    return;
  }

  const dist = Math.hypot(target.x - bot.x, target.y - bot.y) || 1;

  // ── Sin jugadores cerca → patrullar en formación avanzando hacia el objetivo
  if (dist > (CFG.AI_DETECT_RANGE ?? 1600)) {
    botPatrolFormation(bot, room, target);
    return;
  }

  // ── Defensa: bengala si hay un misil hostil encima
  if (incomingMissileNear(bot, room, (CFG.FLARE_RADIUS ?? 200) * 2.2)) botDeployFlare(bot, room);

  // ── Puntería PREDICTIVA: adelanta según velocidad del objetivo y de la bala
  const projSpeed = bot.shipType === "capital" ? 1e9 : (CFG.BULLET_SPEED || 10);
  const lead = CFG.AI_LEAD_FACTOR ?? 1;
  const t = Math.min(dist / projSpeed, 60);                 // ticks estimados de vuelo
  const aimX = target.x + (target.vx || 0) * t * lead;
  const aimY = target.y + (target.vy || 0) * t * lead;
  const leadAngle = Math.atan2(aimY - bot.y, aimX - bot.x) + (bot.aimJitter ?? 0);

  const standoff = (bot.shipType === "bomber" || bot.shipType === "gunship" || bot.shipType === "capital");
  const lowHealth = botHealthFrac(bot) < (CFG.AI_REGROUP_HEALTH_FRAC ?? 0.35);

  // ── MOVIMIENTO ──────────────────────────────────────────
  if (lowHealth) {
    // Herido: huir hacia un aliado (o alejarse del enemigo si está solo) — reagruparse
    const ally = nearestAlly(bot, room);
    const fleeAng = (ally && Math.hypot(ally.x - bot.x, ally.y - bot.y) > 240)
      ? Math.atan2(ally.y - bot.y, ally.x - bot.x)
      : Math.atan2(bot.y - target.y, bot.x - target.x);
    bot.input = { targetAngle: fleeAng, thrust: true, inertiaDamp: true };
  } else if (standoff) {
    // Naves pesadas: mantener distancia preferida encarando al objetivo (kiting)
    const band = 170;
    const input: PlayerInput = { targetAngle: leadAngle, inertiaDamp: true };
    if (dist > bot.distTarget! + band) input.thrust = true;
    else if (dist < bot.distTarget! - band) input.reverse = true;
    // dentro de la banda: deja de empujar y dispara desde posición estable
    bot.input = input;
  } else {
    // Strikers (interceptor/fighter/disruptor): pasadas de ataque approach → break
    if (Date.now() > bot.phaseUntil!) {
      if (bot.attackPhase === "approach") {
        bot.attackPhase = "break";
        if (Math.random() < 0.5) bot.orbitDir! *= -1;
        bot.phaseUntil = Date.now() + 800 + Math.random() * 700;
      } else {
        bot.attackPhase = "approach";
        bot.phaseUntil = Date.now() + (CFG.AI_ATTACK_RUN_TIME ?? 2600);
      }
    }
    // Romper la pasada si nos hemos acercado demasiado
    if (bot.attackPhase === "approach" && dist < (CFG.AI_PASS_DISTANCE ?? 260)) {
      bot.attackPhase = "break";
      bot.phaseUntil = Date.now() + 800 + Math.random() * 700;
    }
    if (bot.attackPhase === "approach") {
      bot.input = { targetAngle: leadAngle, thrust: true, inertiaDamp: true };
    } else {
      // Break: vira alejándose en diagonal y sigue acelerando (nunca se queda parado)
      const away = Math.atan2(bot.y - target.y, bot.x - target.x);
      bot.input = { targetAngle: away + bot.orbitDir! * 0.6, thrust: true, inertiaDamp: true };
    }
  }

  // ── COMBATE ─────────────────────────────────────────────
  const diff = Math.atan2(Math.sin(leadAngle - bot.angle), Math.cos(leadAngle - bot.angle));
  const cone = CFG.AI_FIRE_CONE ?? 0.16;
  const aligned = Math.abs(diff) < cone;

  if (bot.shipType === "capital") {
    if (aligned && dist < CFG.CAPITAL_BEAM_RANGE) {
      bot.beamCharging = true;
      if ((bot.beamChargeTicks ?? 0) >= CFG.CAPITAL_BEAM_CHARGE_TIME) {
        fireCapitalBeam(bot, room);
        bot.beamCharging = false;
        bot.beamChargeTicks = 0;
      }
    } else bot.beamCharging = false;
    return;
  }

  // Cañón: alineado, en rango y no huyendo
  if (aligned && !lowHealth && dist < (CFG.AI_BULLET_RANGE ?? 820) && (bot.bulletCooldown ?? 0) <= 0) {
    bot.bulletCooldown = Math.round(CFG.BULLET_COOLDOWN * (CFG.AI_FIRE_COOLDOWN_MULT ?? 1.5));
    room.bullets.push({
      x: bot.x, y: bot.y,
      vx: Math.cos(bot.angle) * CFG.BULLET_SPEED,
      vy: Math.sin(bot.angle) * CFG.BULLET_SPEED,
      team: bot.team as Team, ownerId: bot.id,
      damage: bot.bulletDamage ?? CFG.BULLET_DAMAGE,
    });
  }

  // Misiles: muchos menos salvo el bomber (es su rol de misilero)
  const missileChance = (CFG.AI_MISSILE_CHANCE ?? 0.012) *
    (bot.shipType === "bomber" ? (CFG.AI_BOMBER_MISSILE_MULT ?? 4) : 1);
  if (
    !lowHealth &&
    Math.abs(diff) < cone * 2.5 &&
    dist < 1300 &&
    (bot.missileCooldown ?? 0) <= 0 &&
    (bot.maxMissiles ?? 0) > 0 &&
    Math.random() < missileChance
  ) {
    bot.missileCooldown = bot.missileCooldownBase ?? CFG.MISSILE_COOLDOWN;
    room.missiles.push({
      id: Date.now() + Math.random(),
      x: bot.x, y: bot.y,
      vx: Math.cos(bot.angle) * CFG.MISSILE_SPEED_INIT,
      vy: Math.sin(bot.angle) * CFG.MISSILE_SPEED_INIT,
      team: bot.team as Team, targetId: target.id, ownerId: bot.id,
      life: CFG.MISSILE_LIFE, torpedo: !!bot.firesTorpedoes,
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
