// Constantes de arranque del servidor (no editables en caliente — a diferencia de
// CFG en config.js). Tamaños de mundo, fps del game loop, aforo de sala y nombres
// de los bots por tipo de nave.

const FPS = 60;

const WORLD_PRESETS = {
  small:  { w: 3000,  h: 3000,  asteroids: 15,  label: "Pequeño" },
  medium: { w: 6000,  h: 6000,  asteroids: 40,  label: "Medio"   },
  large:  { w: 10000, h: 10000, asteroids: 80,  label: "Grande"  },
  huge:   { w: 15000, h: 15000, asteroids: 130, label: "Enorme"  },
};

const MAX_PLAYERS = 20;

const BOT_NAMES = {
  interceptor: "INTERCEPTOR", fighter: "CAZA", bomber: "BOMBARDERO",
  gunship: "CAÑONERA", capital: "CAPITAL", emp: "DISRUPTOR",
};

module.exports = { FPS, WORLD_PRESETS, MAX_PLAYERS, BOT_NAMES };
