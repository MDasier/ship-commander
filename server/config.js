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
  FUEL_REGEN: 0.03,
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

  // ── Rayo principal (nave Capital) — disparo primario del piloto
  CAPITAL_BEAM_DAMAGE: 150,    // muy potente
  CAPITAL_BEAM_CHARGE_TIME: 75, // ticks (~1.25s) manteniendo pulsado para cargar
  CAPITAL_BEAM_RANGE: 1400,    // alcance del rayo
  CAPITAL_BEAM_HALFWIDTH: 14,  // semianchura para detección de impacto
  CAPITAL_BEAM_LIFE: 8,        // ticks que dura el efecto visual
  EMP_DURATION: 90,            // ticks (~1.5s) de chispas rojas del rayo de la Capital (solo visual)

  // ── Nave EMP (Disruptor): pulso en área que "apaga" naves enemigas
  EMP_PULSE_RADIUS: 340,       // radio del estallido alrededor de la nave EMP
  EMP_PULSE_COOLDOWN: 240,     // ticks (~4s) entre pulsos
  EMP_DISABLE_MIN: 120,        // duración mínima del apagado (ticks, ~2s)
  EMP_DISABLE_MAX: 240,        // duración máxima del apagado (ticks, ~4s)
  EMP_PULSE_LIFE: 18,          // ticks del efecto visual de la onda

  // ── Torpedos (misil grande y más dañino — arma del Disruptor)
  TORPEDO_DAMAGE: 90,
  TORPEDO_RADIUS: 26,

  // ── Minas (arma especial del Interceptor)
  MINE_COOLDOWN: 90,           // ticks entre minas (~1.5s)
  MINE_MAX_ACTIVE: 4,          // minas activas simultáneas por jugador
  MINE_ARM_TIME: 30,           // ticks hasta armarse (~0.5s) — no daña a quien la pone
  MINE_LIFE: 1800,             // ticks de vida (~30s) antes de desactivarse
  MINE_TRIGGER_RADIUS: 60,     // distancia a la que un enemigo la dispara
  MINE_BLAST_RADIUS: 120,      // radio de la explosión
  MINE_DAMAGE: 70,             // daño en el centro (decae con la distancia)

  // ── Torreta (nave Capital)
  TURRET_DAMAGE: 40,
  TURRET_COOLDOWN: 6,
  TURRET_BULLET_SPEED: 14,
  GUNNER_MISSILES: 20,
  GUNNER_MISSILE_COOLDOWN: 55,

  // ── IA / Dificultad (bots del modo oleadas)
  AI_SPEED_MULT: 0.55,          // multiplica el empuje del bot (menor = más lento, más fácil de acertar)
  AI_TURN_MULT: 0.55,           // multiplica el giro del bot (menor = menos esquivo)
  AI_AIM_JITTER: 0.22,          // error de puntería en radianes (mayor = falla más)
  AI_FIRE_COOLDOWN_MULT: 1.6,   // multiplica el cooldown de disparo del bot (mayor = dispara menos)

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
      desc: "Muy rápido · Poco armado · Baja firma radar · Suelta minas [X]",
      maxHp: 50,
      thrustMult: 1.55,
      turnMult: 1.65,
      dragVal: 0.985,
      fuelRegenMult: 2.7,
      maxMissiles: 3,
      missileCooldown: 110,
      radarSignature: 700,
      // Escudos — ágil: escudo pequeño pero recarga rápida (estilo hit-and-run)
      maxShield: 35,
      shieldRegenRate: 7,      // unidades/segundo
      shieldRegenDelay: 3.5,   // segundos sin daño antes de empezar a recargar
      // Cápsula de colisión (eje longitudinal +x = proa). front/rear: extremos del
      // segmento en coords locales; radius: semianchura del casco.
      collider: { front: 8, rear: -12, radius: 16 },
    },
    fighter: {
      label: "L.Fighter",
      desc: "Equilibrado · Polivalente · Buen punto de partida",
      maxHp: 100,
      thrustMult: 1.0,
      turnMult: 1.0,
      dragVal: null,
      fuelRegenMult: 2.0,
      maxMissiles: 6,
      missileCooldown: 150,
      radarSignature: 1000,
      // Escudos — equilibrado
      maxShield: 50,
      shieldRegenRate: 6,
      shieldRegenDelay: 4,
      collider: { front: 8, rear: -12, radius: 18 },
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
      collider: { front: 12, rear: -14, radius: 20 },
    },
    gunship: {
      label: "Gunship",
      desc: "2 tripulantes · Torreta artillero · Blindaje extremo",
      maxHp: 600,
      thrustMult: 0.30,
      turnMult: 0.20,
      dragVal: 0.998,
      fuelRegenMult: 2.35,
      maxMissiles: 4 + 20,
      missileCooldown: 240,
      radarSignature: 5000,
      crewCapacity: 2,
      // Escudos — fortaleza: escudo enorme, recarga más lenta por su tamaño
      maxShield: 250,
      shieldRegenRate: 10,
      shieldRegenDelay: 6,
      collider: { front: 14, rear: -16, radius: 30 },
    },
    capital: {
      label: "Capital",
      desc: "4 tripulantes · 3 torretas independientes · Blindaje máximo",
      maxHp: 1500,
      thrustMult: 0.18,
      turnMult: 0.10,
      dragVal: 0.999,
      fuelRegenMult: 2.20,
      maxMissiles: 6,
      missileCooldown: 360,
      radarSignature: 9000,
      crewCapacity: 4,
      // Escudos — dreadnought
      maxShield: 500,
      shieldRegenRate: 14,
      shieldRegenDelay: 8,
      // Casco alargado tipo Idris: cápsula larga y ancha que cubre proa→popa.
      collider: { front: 60, rear: -54, radius: 40 },
    },
    emp: {
      label: "Disruptor",
      desc: "Sigilo extremo · Pulso EMP [X] apaga naves 2-4s · 4 torpedos · Cañón débil",
      maxHp: 50,                 // resistencia de Interceptor
      thrustMult: 1.0,           // velocidad de L.Fighter
      turnMult: 1.0,
      dragVal: null,
      fuelRegenMult: 2.0,
      maxMissiles: 4,            // 4 torpedos (misil grande)
      missileCooldown: 200,
      radarSignature: 150,       // prácticamente indetectable
      bulletDamage: 8,           // cañón normal, más débil que el Interceptor
      torpedo: true,             // sus misiles son torpedos
      // Escudos — ligeros
      maxShield: 30,
      shieldRegenRate: 7,
      shieldRegenDelay: 4,
      // Casco triangular ancho y corto (pico en la proa)
      collider: { front: 14, rear: -12, radius: 34 },
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
