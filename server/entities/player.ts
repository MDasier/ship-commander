// Entidad jugador: creación, aplicación de stats de nave, daño (escudo→HP),
// registro de daño para assists, y muerte (con taunts de IA, tripulación y
// liberación de plazas).

const CFG = require("../config");
const { FPS } = require("../constants.ts");
const { broadcastRoom, notifyPlayer } = require("../net/broadcast.ts");
const { clearCrewSeats } = require("../rooms/rooms.ts");

function createPlayer(id: string): Player {
  return {
    id,
    roomId: null,
    name: "Pilot",
    team: null,
    ready: false,
    dead: false,
    hp: 100,
    fuel: 1000,
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

function applyShipStats(p: Player): void {
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
  // Bengalas — pool por vida (se repone al reaparecer, no se regenera en vuelo)
  p.maxFlares           = ship.maxFlares ?? CFG.FLARE_MAX_DEFAULT ?? 8;
  p.flaresLeft          = p.maxFlares;
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
function applyDamage(room: Room, target: Player, dmg: number, attacker: Player | null, hitAngle: number | null = null): number {
  let dealt = 0;
  if ((target.shield ?? 0) > 0 && dmg > 0) {
    const absorbed = Math.min(target.shield as number, dmg);
    target.shield  = Math.max(0, (target.shield as number) - absorbed);
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

function updateDamageLog(victim: Player, attackerId: string): void {
  const now = Date.now();
  victim.recentDamageFrom = (victim.recentDamageFrom || []).filter(e => now - e.time < 10000);
  const existing = victim.recentDamageFrom.find(e => e.attackerId === attackerId);
  if (existing) existing.time = now;
  else victim.recentDamageFrom.push({ attackerId, time: now });
}

function registerCrewDamage(victim: Player, attacker: Player, room: Room): void {
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
      .forEach(id => updateDamageLog(victim, id as string));
  }
}

function serverChat(room: Room, text: string, team: Team | null = null, name: string = "Enemigo"): void {
  broadcastRoom(room, {
    type: "chat",
    name,
    team,
    text,
    server: true
  });
}

function killPlayer(p: Player, killer: Player | null, weapon: string, room: Room): void {
  const now = Date.now();

  // ── Assists
  for (const entry of (p.recentDamageFrom || [])) {
    if (entry.attackerId === killer?.id) continue;
    if (now - entry.time > 10000) continue;
    const assister = room.players[entry.attackerId];
    if (assister && assister.team !== p.team) {
      assister.assists = (assister.assists || 0) + 1;
    }
  }
  p.recentDamageFrom = [];

  // ── Estado base de muerte
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
  p.deadAt = now;
  p.respawnReadyAt = now + ((CFG.RESPAWN_DELAY ?? 5) * 1000);
  room.shipsDestroyed = true;

  // ─────────────────────────────────────────────
  // BOT MUERE → TAUNT
  // ─────────────────────────────────────────────
  if (p.isBot) {
    const deathLines = [
      "Calculated",
      "This is the way",
      "Unidad perdida.",
      "Error fatal en combate.",
    ];

    serverChat(
      room,
      deathLines[(Math.random() * deathLines.length) | 0],
      p.team,
      p.name
    );
  }

  // ─────────────────────────────────────────────
  // BOT MATA PLAYER
  // ─────────────────────────────────────────────
  if (killer?.isBot && killer.id !== p.id && !p.isBot) {
    const killLines = [
      "Objetivo eliminado.",
      "Demasiado lento.",
      "Sector asegurado.",
      "Sin resistencia.",
      "Otro menos.",
      "Neutralizado.",
    ];

    serverChat(
      room,
      killLines[(Math.random() * killLines.length) | 0],
      killer.team,
      killer.name
    );
  }

  // ── Kills
  if (killer && killer.id !== p.id) {
    killer.kills++;
  }

  // ── Tripulación muere con la nave
  const crewIds = p.gunnerIds
    ? p.gunnerIds.filter(Boolean)
    : (p.gunnerId ? [p.gunnerId] : []);

  for (const gid of crewIds) {
    const gunner = room.players[gid as string];
    if (gunner && !gunner.dead) {
      gunner.hp = 0;
      gunner.dead = true;
      gunner.deaths++;
      gunner.deadAt = now;
      gunner.respawnReadyAt = now + ((CFG.RESPAWN_DELAY ?? 5) * 1000);
    }
    // Regla 1: la nave nodriza ya no existe → el torretero debe elegir nave para
    // reaparecer; se le avisa (en su DeadPanel ya puede elegir nave o torreta libre).
    notifyPlayer(gid as string, "notice.carrierLost");
  }

  // ── Liberar tripulación
  clearCrewSeats(room, p);
}

function pushKill(room: Room, killer: Player | null, victim: Player, weapon: string): void {
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

module.exports = {
  createPlayer,
  applyShipStats,
  applyDamage,
  updateDamageLog,
  registerCrewDamage,
  serverChat,
  killPlayer,
  pushKill,
};
