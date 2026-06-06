// Helpers matematicos puros (sin estado del juego, solo parametros).
// Extraido de game.js (Fase A modular).

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

interface MovingEntity { x: number; y: number; vx: number; vy: number; }
function extrapolateArr<T extends MovingEntity>(arr: T[], ticks: number): T[] {
  return arr.map(e => ({ ...e, x: e.x + e.vx * ticks, y: e.y + e.vy * ticks }));
}

// PRNG determinista por semilla (LCG) — usado para la forma estable de los asteroides.
function seededRand(seed: number): () => number {
  let s = (seed | 0) >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 | 0;
    return (s >>> 0) / 4294967296;
  };
}

// Distancia de un punto (px,py) al segmento (ax,ay)-(bx,by).
function ptSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export { lerp, lerpAngle, extrapolateArr, seededRand, ptSegDist };
