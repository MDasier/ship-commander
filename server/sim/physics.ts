// Matemática de colisiones pura (sin estado). El modelo de colisión de las naves
// es una cápsula: segmento proa→popa (collider.front/rear) + radius. Los
// proyectiles usan trayectoria barrida del tick (anti-tunneling) comparando el
// recorrido prev→actual contra la cápsula.

const CFG = require("../config");

// Distancia mínima de un punto al segmento A→B. Usada para colisión swept
// (anti-tunneling).
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {

  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Distancia mínima entre dos segmentos AB y CD (clásico segment-segment).
// Permite tratar la nave como cápsula (segmento + radio) frente al recorrido
// barrido de un proyectil, en lugar de un punto.
function segToSegDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  const ux = bx - ax, uy = by - ay;
  const vx = dx - cx, vy = dy - cy;
  const wx = ax - cx, wy = ay - cy;
  const a = ux * ux + uy * uy;
  const b = ux * vx + uy * vy;
  const c = vx * vx + vy * vy;
  const d = ux * wx + uy * wy;
  const e = vx * wx + vy * wy;
  const D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c; }
  else {
    sN = b * e - c * d;
    tN = a * e - b * d;
    if (sN < 0)      { sN = 0;  tN = e;     tD = c; }
    else if (sN > sD){ sN = sD; tN = e + b; tD = c; }
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; }
  } else if (tN > tD) {
    tN = tD;
    if ((-d + b) < 0) sN = 0; else if ((-d + b) > a) sN = sD; else { sN = -d + b; sD = a; }
  }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  const px = wx + sc * ux - tc * vx;
  const py = wy + sc * uy - tc * vy;
  return Math.hypot(px, py);
}

function segmentHitsAsteroid(x1: number, y1: number, x2: number, y2: number, asteroids: Asteroid[]): Asteroid | null {
  for (const ast of asteroids) {
    //if (ast.z !== 0) continue;//Para los asteroides flotantes
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t =
      ((ast.x - x1) * dx + (ast.y - y1) * dy) /
      (len2 || 1);

    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const dist2 =
      (px - ast.x) * (px - ast.x) +
      (py - ast.y) * (py - ast.y);
    if (dist2 <= ast.r * ast.r) {
      return ast;
    }
  }
  return null;
}

// Cápsula de colisión de la nave en coords de mundo (segmento de proa a popa + radio).
function shipCapsule(p: Player): Capsule {
  const ship = CFG.SHIP_TYPES[p.shipType] || CFG.SHIP_TYPES.fighter;
  const col  = ship.collider || { front: 0, rear: 0, radius: 14 };
  const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
  return {
    fx: p.x + col.front * cos, fy: p.y + col.front * sin,  // proa
    rx: p.x + col.rear  * cos, ry: p.y + col.rear  * sin,  // popa
    r:  col.radius,
  };
}

// Nave "cubierta": su posición cae dentro del radio de un asteroide flotante (z=1)
function isSheltered(px: number, py: number, asteroids: Asteroid[]): boolean {
  return asteroids.some(a => a.z === 1 && Math.hypot(px - a.x, py - a.y) < a.r);
}

module.exports = {
  distToSegment,
  segToSegDist,
  segmentHitsAsteroid,
  shipCapsule,
  isSheltered,
};
