// Constantes de arranque del servidor (no editables en caliente — a diferencia de
// CFG en config.js). Tamaños de mundo, fps del game loop, aforo de sala y nombres
// de los bots por tipo de nave.

interface WorldPreset { w: number; h: number; asteroids: number; label: string; }

const FPS = 60;

const WORLD_PRESETS: Record<string, WorldPreset> = {
  small:  { w: 10000, h: 10000, asteroids: 15,  label: "Pequeño" },
  medium: { w: 20000, h: 20000, asteroids: 40,  label: "Medio"   },
  large:  { w: 35000, h: 35000, asteroids: 80,  label: "Grande"  },
  huge:   { w: 50000, h: 50000, asteroids: 130, label: "Enorme"  },
};

const MAX_PLAYERS = 20;

const BOT_NAMES: Record<string, string> = {
  interceptor: "INTERCEPTOR", fighter: "CAZA", bomber: "BOMBARDERO",
  gunship: "CAÑONERA", capital: "CAPITAL", emp: "DISRUPTOR",
};

module.exports = { FPS, WORLD_PRESETS, MAX_PLAYERS, BOT_NAMES };
