// Helpers matematicos puros (sin estado del juego, solo parametros).
// Extraido de game.js (Fase A modular).

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function extrapolateArr(arr, ticks) {
  return arr.map(e => ({ ...e, x: e.x + e.vx * ticks, y: e.y + e.vy * ticks }));
}

// PRNG determinista por semilla (LCG) — usado para la forma estable de los asteroides.
function seededRand(seed) {
  let s = (seed | 0) >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 | 0;
    return (s >>> 0) / 4294967296;
  };
}

// Distancia de un punto (px,py) al segmento (ax,ay)-(bx,by).
function ptSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export { lerp, lerpAngle, extrapolateArr, seededRand, ptSegDist };
