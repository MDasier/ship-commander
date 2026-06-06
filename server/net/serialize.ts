// Construcción del mensaje `state` que el servidor difunde a la sala cada tick.
// El contenido de este objeto es parte del protocolo cliente↔servidor: cualquier
// cambio aquí debe coordinarse con el receptor en client/game.js.

const { FPS } = require("../constants.ts");
const { WAVES } = require("../ai/waves.ts");

function buildState(room: Room): any {
  return {
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
    waveTotal: WAVES().length,
    enemiesLeft: room.waveMode ? Object.values(room.players).filter(p => p.isBot && !p.dead).length : 0,
    waveBanner: (room.waveMode && room.waveBannerUntil > Date.now())
      ? { key: room.waveBannerKey, n: room.waveBannerN } : null,
  };
}

module.exports = { buildState };
