// ── Sensores / objetivo ───────────────────────────────────────────────
// Lógica de cobertura (asteroides), línea de visión y selección de objetivo.
// Replica las reglas del servidor en cliente para decidir qué enemigos son
// visibles en el radar y cuál se puede fijar. Solo lee/escribe `S`.

import { S } from "../state";
import { ptSegDist } from "../math";

// Nave "cubierta": dentro del radio de un asteroide flotante (z=1, sobre las naves).
export function isSheltered(px: number, py: number): boolean {
  return S.asteroids.some(a => a.z === 1 && Math.hypot(px - a.x, py - a.y) < a.r);
}

// Línea de visión bloqueada: algún asteroide de colisión (z=0) corta el segmento.
export function losBlocked(ax: number, ay: number, bx: number, by: number): boolean {
  return S.asteroids.some(a => a.z === 0 && ptSegDist(a.x, a.y, ax, ay, bx, by) < a.r);
}

// Enemigos visibles en radar: firma de radar, cobertura de asteroide y LOS.
export function radarVisibleEnemies(): any[] {
  const me = S.players[S.myId as string];
  if (!me) return [];
  return Object.values(S.players).filter((p: any) => {
    if (p.dead || p.team === me.team || p.pilotingFor) return false;
    if (Math.hypot(p.x - me.x, p.y - me.y) > (p.radarSignature || 450)) return false;
    if (isSheltered(p.x, p.y)) return false;       // bajo asteroide flotante → oculto
    if (losBlocked(me.x, me.y, p.x, p.y)) return false; // asteroide sólido entre medias
    return true;
  });
}

// Cicla el objetivo entre enemigos visibles (al pasar del último → deslockear).
export function cycleTarget() {
  const enemies = radarVisibleEnemies();
  if (enemies.length === 0) { S.targetId = null; return; }
  if (!S.targetId) { S.targetId = enemies[0].id; return; }
  const idx = enemies.findIndex((e: any) => e.id === S.targetId);
  if (idx === -1) { S.targetId = enemies[0].id; return; }
  if (idx === enemies.length - 1) { S.targetId = null; return; }
  S.targetId = enemies[idx + 1].id;
}

// Variante para el clic derecho (mismo comportamiento de ciclado).
export function cycleTargetByRadar() {
  const enemies = radarVisibleEnemies();
  if (enemies.length === 0) { S.targetId = null; return; }
  if (!S.targetId) { S.targetId = enemies[0].id; return; }
  const idx = enemies.findIndex((e: any) => e.id === S.targetId);
  if (idx === -1) { S.targetId = enemies[0].id; return; }
  // Al llegar al último → deslockear (null); siguiente click vuelve al primero
  S.targetId = idx === enemies.length - 1 ? null : enemies[idx + 1].id;
}
