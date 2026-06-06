// Sistema de oleadas (modo solo / co-op vs IA). Las oleadas y las vidas de equipo
// viven en config (editables desde el panel admin). El mismo manageWaves se usa en
// co-op multijugador y en práctica en solitario.

const CFG = require("../config");
const { FPS } = require("../constants.ts");
const { makeBot } = require("./ai");

// Oleadas escaladas: cada vez más naves/dureza hasta el jefe (Capital).
const WAVES = () => CFG.WAVES;
const TEAM_LIVES = () => CFG.TEAM_LIVES;

function spawnWave(room, n) {
  const wave = WAVES()[n - 1];
  if (!wave) return;

  const ships = [...wave.ships];
  const humans = Object.values(room.players).filter(p => !p.isBot && !p.pilotingFor).length || 1;

  for (let i = 0; i < humans - 1; i++) {
    ships.push(wave.boss ? "fighter" : wave.ships[i % wave.ships.length]);
  }

  ships.forEach(t => makeBot(room, t));
}

// Gestiona la progresión de oleadas de una sala.
// El banner se envía como clave i18n + número; el cliente lo traduce al idioma local.
function setWaveBanner(room, key, n = 0, ms = 3000) {
  room.waveBannerKey = key;
  room.waveBannerN   = n;
  room.waveBannerUntil = Date.now() + ms;
}

function manageWaves(room) {
  if (room.winner) return;

  const humans = Object.values(room.players).filter(p => !p.isBot && !p.pilotingFor);

  if (humans.length && (room.teamLives ?? 0) <= 0 && humans.every(p => p.dead)) {
    room.winner = "red";
    setWaveBanner(room, "wave.defeat", 0, 6000);
    return;
  }

  Object.values(room.players).forEach(p => {
    if (p.isBot && p.dead && p.deadAt && Date.now() - p.deadAt > 1500) {
      delete room.players[p.id];
    }
  });

  const livingBots = Object.values(room.players).filter(p => p.isBot && !p.dead).length;

  if (room.waveState === "intermission") {
    if (--room.waveTimer <= 0) {
      room.wave++;

      if (room.wave > WAVES().length) {
        room.winner = "green";
        setWaveBanner(room, "wave.complete", 0, 6000);
        return;
      }

      spawnWave(room, room.wave);
      room.waveState = "active";

      setWaveBanner(
        room,
        WAVES()[room.wave - 1].boss ? "wave.boss" : "wave.start",
        room.wave
      );
    }
    return;
  }

  if (livingBots === 0) {
    room.waveState = "intermission";
    room.waveTimer = 5 * FPS;
    setWaveBanner(room, "wave.cleared", room.wave);
  }
}

module.exports = { WAVES, TEAM_LIVES, setWaveBanner, spawnWave, manageWaves };
