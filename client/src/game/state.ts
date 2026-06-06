// ── Estado mutable del cliente (centralizado) ─────────────────────────
// Un único objeto mutable `S` que reúne todo el estado top-level que antes
// vivían como `let` sueltos en game.ts. En ES modules no se pueden reasignar
// imports, así que el estado compartido entre módulos (net, input, render…)
// vive aquí y se MUTA (S.x = …), nunca se reasigna la referencia `S`.
//
// El dominio del juego es complejo y llega como JSON del servidor; usamos
// shapes laxos (`any`) a propósito: el objetivo es centralizar, no tipar el
// protocolo entero. Lo importante es que haya una única fuente de verdad.

// Entidad de jugador / proyectil tal como llega del servidor (campos dinámicos).
type Entity = Record<string, any>;

// Snapshot del buffer de interpolación.
interface StateSnapshot {
  time: number;
  players: Record<string, Entity>;
  bullets: Entity[];
  missiles: Entity[];
  flares: Entity[];
}

export const S = {
  // ── Identidad / sala ──
  uiState: "lobby" as string,
  currentRoomId: null as string | null,
  myId: null as string | null,
  roomData: null as any,
  roomList: [] as any[],
  shipMeta: null as any,

  // ── Entidades del mundo (estado interpolado / difundido) ──
  players: {} as Record<string, Entity>,
  bullets: [] as Entity[],
  beams: [] as Entity[],
  empPulses: [] as Entity[],
  mines: [] as Entity[],
  asteroids: [] as Entity[],
  missiles: [] as Entity[],
  flares: [] as Entity[],
  world: { width: 10000, height: 10000 } as { width: number; height: number },

  // Deduplicación de efectos de sonido por id de pulso/rayo.
  prevPulseIds: new Set<string>(),
  prevBeamIds: new Set<string>(),

  // ── Modo oleadas (solo práctica) ──
  soloMode: false,
  waveMode: false,
  teamLives: null as number | null,
  waveNum: 0,
  waveTotal: 0,
  enemiesLeft: 0,
  waveBanner: null as any,
  waveBannerSig: null as string | null,
  waveBannerShownAt: 0,

  // ── Objetivo / radar / sensores ──
  targetId: null as string | null,
  scanUntil: 0,
  pingEnemiesUntil: 0,
  nextPingAt: 0,
  inertiaDampActive: true,

  // ── Resultado de partida ──
  winner: null as string | null,
  prevWinner: null as string | null,

  // ── Interpolación cliente ──
  stateBuffer: [] as StateSnapshot[],

  // ── Estado de vida / espectador / UI en partida ──
  deadIds: new Set<string>(),
  specTargetId: null as string | null,
  killFeed: [] as any[],
  chatLog: [] as any[],
  shakeMag: 0,
  clientDeadAt: null as number | null,
  showScoreboard: false,

  // ── Input (ratón) ──
  mouseX: 0,
  mouseY: 0,

  // ── Flags de overlays / juego ──
  inGame: false,
  mobiOpen: false,
  chatInputOpen: false,

  // ── Sistema de calor de arma ──
  weaponHeat: 0,
  mouseLeftHeld: false,
  weaponOverheated: false,

  // Avisos de voz por flanco.
  voiceFuelLow: false,
  voiceShieldDown: false,

  // ── Rayo de la Capital ──
  beamHeld: false,
  beamWasReady: false,
  abilityWasReady: true,

  // ── Nombre del jugador ──
  playerName: "" as string,

  // ── Conexión / reconexión ──
  connLost: false,
  everConnected: false,
};
