const fs   = require("fs");
const path = require("path");

const DEFAULTS = {
  // ── Partida
  GAME_DURATION_S: 180,

  // ── Física de nave
  TURN_RATE:      0.08,
  THRUST:         0.25,
  THRUST_FUEL:    0.05,
  REVERSE_THRUST: 0.10,
  REVERSE_FUEL:   0.03,
  FUEL_REGEN:     0.015,
  DRAG:           0.99,

  // ── Balas
  BULLET_SPEED:    10,
  BULLET_COOLDOWN: 5,
  BULLET_DAMAGE:   15,
  BULLET_RADIUS:   15,

  // ── Misiles
  MISSILE_SPEED_INIT: 8,
  MISSILE_SPEED_MAX:  12,
  MISSILE_COOLDOWN:   150,
  MISSILE_LIFE:       100,
  MISSILE_TURN:       0.18,
  MISSILE_THRUST:     0.6,
  MISSILE_DAMAGE:     40,
  MISSILE_RADIUS:     18,
  MISSILE_MAX_ACTIVE: 6,

  // ── Bengalas
  FLARE_LIFE:     90,
  FLARE_COOLDOWN: 100,
  FLARE_RADIUS:   200,
  FLARE_TURN:     0.20,
  FLARE_THRUST:   0.6,

  // ── Asteroides
  ASTEROID_IMPACT_MIN:    3,
  ASTEROID_DAMAGE_FACTOR: 4,

  // ── Audio (se envía al cliente via /config)
  VOL_MASTER: 0.8,
  VOL_MUSIC:  0.2,

  // ── Tipos de nave
  SHIP_TYPES: {
    interceptor: {
      label:            "Interceptor",
      maxHp:            50,
      thrustMult:       1.55,
      turnMult:         1.65,
      dragVal:          0.985,
      fuelRegenMult:    1.7,
      maxMissiles:      3,
      missileCooldown:  110,
      radarSignature:   700,
    },
    fighter: {
      label:            "Caza",
      maxHp:            120,
      thrustMult:       1.0,
      turnMult:         1.0,
      dragVal:          null,   // usa CFG.DRAG
      fuelRegenMult:    1.0,
      maxMissiles:      6,
      missileCooldown:  150,
      radarSignature:   1000,
    },
    bomber: {
      label:            "Bombardero",
      maxHp:            300,
      thrustMult:       0.60,
      turnMult:         0.55,
      dragVal:          0.996,
      fuelRegenMult:    0.55,
      maxMissiles:      12,
      missileCooldown:  85,
      radarSignature:   2000,
    },
  },
};

const cfgPath = path.join(__dirname, "config.json");
const cfg = { ...DEFAULTS };

try {
  if (fs.existsSync(cfgPath)) {
    Object.assign(cfg, JSON.parse(fs.readFileSync(cfgPath, "utf8")));
  }
} catch (e) { console.warn("config.json inválido, usando defaults"); }

cfg.save = function () {
  const data = { ...cfg };
  delete data.save;
  fs.writeFileSync(cfgPath, JSON.stringify(data, null, 2));
};

module.exports = cfg;
