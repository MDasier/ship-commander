// Tipos de dominio del servidor (ambiente/global — sin import/export, así están
// disponibles en todos los .ts sin necesidad de importarlos). Solo son anotaciones
// de tipo: Node 24 las borra en tiempo de ejecución (type stripping) y tsc las usa
// para chequear. Este fichero no se carga en runtime.
//
// Nota: el servidor es CommonJS; los módulos se importan con require(), por lo que
// TypeScript ve los límites entre módulos como `any`. El valor del tipado vive
// DENTRO de cada módulo y en estos shapes de dominio.

type Team = "green" | "red";

interface Vec2 {
  x: number;
  y: number;
}

// Input que envía el cliente (~30/s). El servidor también lo fija para los bots.
interface PlayerInput {
  targetAngle?: number;
  left?: boolean;
  right?: boolean;
  thrust?: boolean;
  reverse?: boolean;
  strafeLeft?: boolean;
  strafeRight?: boolean;
  inertiaDamp?: boolean;
}

interface Asteroid {
  x: number;
  y: number;
  r: number;
  z: -1 | 0 | 1;   // profundidad: -1 detrás, 0 sólido, 1 flotante (cubre)
}

// Cápsula de colisión en coords de mundo: segmento proa(f)→popa(r) + radio.
interface Capsule {
  fx: number; fy: number;
  rx: number; ry: number;
  r: number;
}

interface Bullet {
  x: number; y: number;
  vx: number; vy: number;
  team: Team;
  ownerId: string;
  damage: number;
}

interface Missile {
  id?: number;
  x: number; y: number;
  vx: number; vy: number;
  prevX?: number; prevY?: number;
  team: Team;
  targetId: string | null;
  ownerId: string;
  life: number;
  torpedo: boolean;
  flareTarget?: number | null;
}

interface Mine {
  id: number;
  x: number; y: number;
  team: Team;
  ownerId: string;
  arm: number;
  maxArm: number;
  life: number;
  maxLife: number;
}

interface Beam {
  id: number;
  x1: number; y1: number;
  x2: number; y2: number;
  team: Team;
  ownerId: string;
  hit: boolean;
  life: number;
  maxLife: number;
}

interface EmpPulse {
  id: number;
  x: number; y: number;
  r: number;
  team: Team;
  life: number;
  maxLife: number;
  blast?: boolean;
}

interface Flare {
  id: number;
  x: number; y: number;
  life: number;
  team: Team;
}

interface KillFeedEntry {
  killerName: string | null;
  killerTeam: Team | null;
  victimName: string;
  victimTeam: Team | null;
  weapon: string;
  time: number;
}

interface DamageEntry {
  attackerId: string;
  time: number;
}

// Jugador (humano o bot). Muchos campos se añaden dinámicamente según el estado
// de la partida o el rol (artillero, bot), por eso buena parte son opcionales.
interface Player {
  id: string;
  roomId: string | null;
  name: string;
  team: Team | null;
  ready: boolean;
  dead: boolean;
  hp: number;
  fuel: number;
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  input: PlayerInput;
  shipType: string;

  // Cooldowns / timers
  missileCooldown: number;
  bulletCooldown: number;
  flaredCooldown: number;
  turretCooldown: number;
  missileCooldownBase: number;
  missilesActive: number;
  hitFlash: number;
  beamHit?: number;

  // Stats
  kills: number;
  deaths: number;
  damageDealt: number;
  assists: number;
  maxHp: number;
  maxMissiles: number;
  radarSignature: number;
  recentDamageFrom: DamageEntry[];
  respawnsLeft?: number;
  deadAt?: number | null;
  respawnReadyAt?: number;

  // Derivados de la nave (applyShipStats)
  thrustVal?: number;
  reverseThrustVal?: number;
  turnRateVal?: number;
  dragVal?: number;
  fuelRegenVal?: number;
  bulletDamage?: number;
  firesTorpedoes?: boolean;
  maxFlares?: number;
  flaresLeft?: number;

  // Escudos
  maxShield?: number;
  shield?: number;
  shieldRegenPerTick?: number;
  shieldRegenDelayTicks?: number;
  shieldHitTimer?: number;
  shieldFlash?: number;
  shieldHitAngle?: number | null;

  // Rayo de la Capital
  beamCharging?: boolean;
  beamChargeTicks?: number;
  beamCharge?: number;

  // EMP
  empTimer?: number;
  empMax?: number;
  emp?: number;
  empDisableTicks?: number;
  empDisabled?: boolean;
  empCooldown?: number;

  // Minas
  mineCooldown?: number;

  // Tripulación (crew)
  pilotingFor: string | null;
  gunnerId: string | null;
  gunnerIds?: Array<string | null>;
  turretAngle: number;
  turretAngles?: Record<string, number>;
  turretIndex?: number;

  // Misiles entrantes (marcado por la simulación)
  lockedOnMe: number;
  lockedByMissile?: boolean;
  targetId?: string | null;

  // Bots (IA)
  isBot?: boolean;
  currentTargetId?: string;
  aimJitter?: number;
  orbitDir?: number;
  attackPhase?: "approach" | "break";
  phaseUntil?: number;
  distTarget?: number;
}

// Sala / partida. Estructuras de proyectiles y efectos viven aquí.
interface Room {
  id: string;
  status: "waiting" | "playing";
  ownerId: string;
  name: string;
  enforceBalance: boolean;
  worldSize: string;
  worldW: number;
  worldH: number;
  players: Record<string, Player>;
  bullets: Bullet[];
  missiles: Missile[];
  beams: Beam[];
  empPulses: EmpPulse[];
  mines: Mine[];
  flare: Flare[];
  asteroids: Asteroid[];
  winner: Team | "draw" | null;
  killFeed: KillFeedEntry[];
  timeLeft: number;
  allowJoinMidGame: boolean;

  // Opcionales según modo
  solo?: boolean;
  coopMode?: boolean;
  durationS?: number;
  gameValid?: boolean;
  shipsDestroyed?: boolean;

  // Oleadas
  waveMode?: boolean;
  wave?: number;
  waveState?: "intermission" | "active" | null;
  waveTimer?: number;
  teamLives?: number;
  waveBanner?: unknown;
  waveBannerKey?: string;
  waveBannerN?: number;
  waveBannerUntil?: number;
}
