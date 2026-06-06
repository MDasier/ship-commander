// Ciclo de vida de una partida: arranque (spawn de pilotos y artilleros, equipos,
// validez de la partida, modo oleadas) y reinicio manteniendo a los jugadores.

const CFG = require("../config");
const { FPS } = require("../constants.ts");
const { applyShipStats } = require("../entities/player.ts");
const { spawnPos } = require("../entities/spawn.ts");
const { setWaveBanner, TEAM_LIVES } = require("../ai/waves.ts");
const { broadcastRoom } = require("../net/broadcast.ts");

function startGame(room: Room): void {
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
    room.waveTimer = 5 * FPS;     // primera oleada en ~3s
    room.teamLives = TEAM_LIVES();  // pool de vidas compartido del equipo
    setWaveBanner(room, "PREPARAOS...", 3000);
  }

  broadcastRoom(room, { type: "gameStarted" });
}

function restartRoom(room: Room): void {
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

module.exports = { startGame, restartRoom };
