const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  // ── Partida
  GAME_DURATION_S: 180,

  // ── Física de nave
  TURN_RATE: 0.08,
  THRUST: 0.25,
  THRUST_FUEL: 0.05,
  REVERSE_THRUST: 0.10,
  REVERSE_FUEL: 0.03,
  FUEL_REGEN: 0.015,
  DRAG: 0.99,

  // ── Balas
  BULLET_SPEED: 10,
  BULLET_COOLDOWN: 5,
  BULLET_DAMAGE: 15,
  BULLET_RADIUS: 15,

  // ── Misiles
  MISSILE_SPEED_INIT: 8,
  MISSILE_SPEED_MAX: 12,
  MISSILE_COOLDOWN: 150,
  MISSILE_LIFE: 100,
  MISSILE_TURN: 0.18,
  MISSILE_THRUST: 0.6,
  MISSILE_DAMAGE: 40,
  MISSILE_RADIUS: 18,
  MISSILE_MAX_ACTIVE: 6,

  // ── Bengalas
  FLARE_LIFE: 90,
  FLARE_COOLDOWN: 100,
  FLARE_RADIUS: 200,
  FLARE_TURN: 0.20,
  FLARE_THRUST: 0.6,

  // ── Reaparición
  RESPAWN_DELAY: 5,
  RESPAWN_COUNT: 3,

  // ── Torreta (nave Capital)
  TURRET_DAMAGE: 40,
  TURRET_COOLDOWN: 6,
  TURRET_BULLET_SPEED: 14,
  GUNNER_MISSILES: 20,
  GUNNER_MISSILE_COOLDOWN: 55,

  // ── Asteroides
  ASTEROID_IMPACT_MIN: 3,
  ASTEROID_DAMAGE_FACTOR: 4,

  // ── Audio
  VOL_MASTER: 0.8,
  VOL_MUSIC: 0.2,

  // ── Tipos de nave
  SHIP_TYPES: {
    interceptor: {
      label: "Interceptor",
      desc: "Muy rápido · Poco armado · Baja firma radar",
      maxHp: 50,
      thrustMult: 1.55,
      turnMult: 1.65,
      dragVal: 0.985,
      fuelRegenMult: 1.7,
      maxMissiles: 3,
      missileCooldown: 110,
      radarSignature: 700,
      // Escudos — ágil: escudo pequeño pero recarga rápida (estilo hit-and-run)
      maxShield: 35,
      shieldRegenRate: 7,      // unidades/segundo
      shieldRegenDelay: 3.5,   // segundos sin daño antes de empezar a recargar
    },
    fighter: {
      label: "L.Fighter",
      desc: "Equilibrado · Polivalente · Buen punto de partida",
      maxHp: 100,
      thrustMult: 1.0,
      turnMult: 1.0,
      dragVal: null,
      fuelRegenMult: 1.0,
      maxMissiles: 6,
      missileCooldown: 150,
      radarSignature: 1000,
      // Escudos — equilibrado
      maxShield: 50,
      shieldRegenRate: 6,
      shieldRegenDelay: 4,
    },
    bomber: {
      label: "Bomber",
      desc: "Muy resistente · Lento · Alta firma radar · Muchos misiles",
      maxHp: 300,
      thrustMult: 0.60,
      turnMult: 0.55,
      dragVal: 0.996,
      fuelRegenMult: 0.55,
      maxMissiles: 12,
      missileCooldown: 85,
      radarSignature: 2000,
      // Escudos — tanque: escudo grande, recarga moderada y largo cooldown
      maxShield: 120,
      shieldRegenRate: 8,
      shieldRegenDelay: 5,
    },
    gunship: {
      label: "Gunship",
      desc: "2 tripulantes · Torreta artillero · Blindaje extremo",
      maxHp: 600,
      thrustMult: 0.30,
      turnMult: 0.20,
      dragVal: 0.998,
      fuelRegenMult: 0.35,
      maxMissiles: 4 + 20,
      missileCooldown: 240,
      radarSignature: 5000,
      crewCapacity: 2,
      // Escudos — fortaleza: escudo enorme, recarga más lenta por su tamaño
      maxShield: 250,
      shieldRegenRate: 10,
      shieldRegenDelay: 6,
    },
    capital: {
      label: "Capital",
      desc: "4 tripulantes · 3 torretas independientes · Blindaje máximo",
      maxHp: 1500,
      thrustMult: 0.18,
      turnMult: 0.10,
      dragVal: 0.999,
      fuelRegenMult: 0.20,
      maxMissiles: 6,
      missileCooldown: 360,
      radarSignature: 9000,
      crewCapacity: 4,
      // Escudos — dreadnought
      maxShield: 500,
      shieldRegenRate: 14,
      shieldRegenDelay: 8,
    },
  },

  // ── Artilleros de Capital (3 torretas)
  CAPITAL_GUNNER_MISSILES:       15,
  CAPITAL_GUNNER_MISSILE_COOLDOWN: 70,
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
