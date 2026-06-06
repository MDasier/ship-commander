// @ts-nocheck
// ── Render del mundo: límites, grid, ping y asteroides ────────────────
import { S } from "../state";
import { canvas, ctx, getMe, worldToScreen } from "./canvas";
import { seededRand } from "../math";

// Limpia la caché de formas de asteroide (la llama game.ts al resetear la sala).
export function clearAsteroidCache() { asteroidCache.clear(); }

function drawWorldBounds(camX, camY) {
  const me = getMe();
  if (!me) return;

  const WORLD_SIZE = 10000;
  const WARNING_DIST = 1000;

  const leftDist   = me.x;
  const rightDist  = WORLD_SIZE - me.x;
  const topDist    = me.y;
  const bottomDist = WORLD_SIZE - me.y;

  const leftX   = worldToScreen(0, 0, camX, camY).x;
  const rightX  = worldToScreen(WORLD_SIZE, 0, camX, camY).x;
  const topY    = worldToScreen(0, 0, camX, camY).y;
  const bottomY = worldToScreen(0, WORLD_SIZE, camX, camY).y;

  const t = performance.now() * 0.003;

  drawEdge(
    leftDist,
    WARNING_DIST,
    drawVerticalBarrier(leftX, true)
  );
  
  drawEdge(
    rightDist,
    WARNING_DIST,
    drawVerticalBarrier(rightX, false)
  );
  
  drawEdge(
    topDist,
    WARNING_DIST,
    drawHorizontalBarrier(topY, true)
  );
  
  drawEdge(
    bottomDist,
    WARNING_DIST,
    drawHorizontalBarrier(bottomY, false)
  );

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // -------------------------

  function drawEdge(dist, maxDist, render) {
    if (dist >= maxDist) return;
    const intensity = Math.pow(
      1 - dist / maxDist,
      1.8
    );
    render(intensity);
  }

  function drawVerticalBarrier(x, isLeft, color = "orange") {

    const colors = {
      red:   { r: 255, g: 50,  b: 50,  glow: "#ff5555" },
      orange:{ r: 255, g: 140, b: 0,   glow: "#ff9900" },
      gray:  { r: 180, g: 180, b: 180, glow: "#bbbbbb" }
    };
  
    const c = colors[color] || colors.red;
  
    return function (intensity) {
  
      const fogWidth = Math.min(canvas.width * 0.35, 300);
  
      const grad = ctx.createLinearGradient(
        isLeft ? x : x - fogWidth,
        0,
        isLeft ? x + fogWidth : x,
        0
      );
  
      const rgba = (a) => `rgba(${c.r},${c.g},${c.b},${a})`;
  
      if (isLeft) {
        grad.addColorStop(0, rgba(0.30 * intensity));
        grad.addColorStop(1, rgba(0));
      } else {
        grad.addColorStop(0, rgba(0));
        grad.addColorStop(1, rgba(0.30 * intensity));
      }
  
      ctx.fillStyle = grad;
  
      ctx.fillRect(
        isLeft ? x : x - fogWidth,
        0,
        fogWidth,
        canvas.height
      );
  
      // Glow
      ctx.shadowBlur = 30 * intensity;
      ctx.shadowColor = c.glow;
  
      // Línea principal
      ctx.strokeStyle = rgba(0.9 * intensity);
      ctx.lineWidth = 4;
  
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
  
      // Ondulación energética
      ctx.strokeStyle = `rgba(255,255,255,${0.25 * intensity})`;
      ctx.lineWidth = 1;
  
      ctx.beginPath();
  
      for (let y = 0; y <= canvas.height; y += 6) {
        const wave = Math.sin(y * 0.025 + t) * 8 * intensity;
  
        if (y === 0) ctx.moveTo(x + wave, y);
        else ctx.lineTo(x + wave, y);
      }
  
      ctx.stroke();
    };
  }

  function drawHorizontalBarrier(y, isTop, color = "orange") {

    const colors = {
      red:   { r: 255, g: 50,  b: 50,  glow: "#ff5555" },
      orange:{ r: 255, g: 140, b: 0,   glow: "#ff9900" },
      gray:  { r: 180, g: 180, b: 180, glow: "#bbbbbb" }
    };
  
    const c = colors[color] || colors.red;
  
    return function (intensity) {
  
      const fogHeight = Math.min(canvas.height * 0.35, 300);
  
      const grad = ctx.createLinearGradient(
        0,
        isTop ? y : y - fogHeight,
        0,
        isTop ? y + fogHeight : y
      );
  
      const rgba = (a) => `rgba(${c.r},${c.g},${c.b},${a})`;
  
      if (isTop) {
        grad.addColorStop(0, rgba(0.30 * intensity));
        grad.addColorStop(1, rgba(0));
      } else {
        grad.addColorStop(0, rgba(0));
        grad.addColorStop(1, rgba(0.30 * intensity));
      }
  
      ctx.fillStyle = grad;
  
      ctx.fillRect(
        0,
        isTop ? y : y - fogHeight,
        canvas.width,
        fogHeight
      );
  
      ctx.shadowBlur = 30 * intensity;
      ctx.shadowColor = c.glow;
  
      ctx.strokeStyle = rgba(0.9 * intensity);
      ctx.lineWidth = 4;
  
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
  
      ctx.strokeStyle = `rgba(255,255,255,${0.25 * intensity})`;
      ctx.lineWidth = 1;
  
      ctx.beginPath();
  
      for (let x = 0; x <= canvas.width; x += 6) {
        const wave = Math.sin(x * 0.025 + t) * 8 * intensity;
  
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
  
      ctx.stroke();
    };
  }
}

function drawGrid(camX, camY) {
  return;
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 0;

  const size = 100;

  const startX = -camX % size;
  const startY = -camY % size;

  for (let x = startX; x < canvas.width; x += size) {

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();

  }

  for (let y = startY; y < canvas.height; y += size) {

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();

  }

}


//!EFECTO DE PING

//!EFECTO DE PING
// Cola de ondas de ping del radar. El productor (triggerPingEffect) lo llama
// el input al pulsar escaneo; el consumidor (drawpingEffect) las dibuja/expira.
const pingEffect = [];
export function triggerPingEffect(x, y) {
  pingEffect.push({ x, y, start: performance.now(), duration: 1200 });
}

function drawpingEffect(camX, camY) {
  const now = performance.now();

  for (let i = pingEffect.length - 1; i >= 0; i--) {
    const emp = pingEffect[i];
    const t =
      (now - emp.start) /
      emp.duration;

    if (t >= 1) {
      pingEffect.splice(i, 1);
      continue;
    }

    const pos = worldToScreen(
      emp.x,
      emp.y,
      camX,
      camY
    );

    const radius = t * 900;
    const alpha = 1 - t;

    ctx.save();

    const gradient =
      ctx.createRadialGradient(
        pos.x,
        pos.y,
        Math.max(0, radius - 30),
        pos.x,
        pos.y,
        radius
      );

    gradient.addColorStop(
      0,
      "rgba(0,255,255,0)"
    );

    gradient.addColorStop(
      0.75,
      `rgba(0,255,255,${alpha * 0.15})`
    );

    gradient.addColorStop(
      1,
      `rgba(0,255,255,${alpha})`
    );

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 8;

    ctx.beginPath();
    ctx.arc(
      pos.x,
      pos.y,
      radius,
      0,
      Math.PI * 2
    );

    ctx.stroke();
    ctx.restore();
  }
}

// ── Asteroid rendering ─────────────────────────

// LCG pseudo-random con semilla para formas consistentes entre clientes

// ── Asteroid rendering ─────────────────────────

// LCG pseudo-random con semilla para formas consistentes entre clientes
const asteroidCache = new Map(); // key → { pts, colorIdx }

function getAsteroidProps(ast) {
  const key = `${Math.round(ast.x)}_${Math.round(ast.y)}`;
  if (asteroidCache.has(key)) return asteroidCache.get(key);

  const seed = Math.abs(Math.round(ast.x) * 73856093 ^ Math.round(ast.y) * 19349663);
  const rand = seededRand(seed);

  const numPts = 7 + Math.floor(rand() * 5); // 7–11 vértices
  const pts = [];
  for (let i = 0; i < numPts; i++) {
    const baseAngle = (i / numPts) * Math.PI * 2;
    const jitter = (rand() - 0.5) * (Math.PI * 2 / numPts) * 0.55;
    const r = ast.r * (0.52 + rand() * 0.48);
    pts.push([Math.cos(baseAngle + jitter) * r, Math.sin(baseAngle + jitter) * r]);
  }

  const colorIdx = Math.floor(rand() * 5);
  const props = { pts, colorIdx };
  asteroidCache.set(key, props);
  return props;
}

const ASTEROID_PALETTES = [
  { fill: '#2c2c2c', hi: '#404040', lo: '#181818', stroke: '#3a3a3a' },
  { fill: '#363636', hi: '#4c4c4c', lo: '#202020', stroke: '#464646' },
  { fill: '#424242', hi: '#5a5a5a', lo: '#2a2a2a', stroke: '#525252' },
  { fill: '#4e4e4e', hi: '#666666', lo: '#343434', stroke: '#5e5e5e' },
  { fill: '#5a5a5a', hi: '#727272', lo: '#3e3e3e', stroke: '#6a6a6a' },
];

function drawOneAsteroid(a, camX, camY) {
  const { pts, colorIdx } = getAsteroidProps(a);
  const pal = ASTEROID_PALETTES[colorIdx];
  const pos = worldToScreen(a.x, a.y, camX, camY);
  const isAbove = a.z === 1;
  const isBelow = a.z === -1;

  ctx.save();
  ctx.translate(pos.x, pos.y);

  if (isBelow) ctx.globalAlpha = 0.36;

  // Sombra proyectada para asteroides flotantes (z=1)
  if (isAbove) {
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 6;
    ctx.shadowOffsetY = 8;
  }

  // Silueta irregular
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();

  // Gradiente radial descentrado → efecto 3D
  const hlX = -a.r * 0.28;
  const hlY = -a.r * 0.32;
  const grad = ctx.createRadialGradient(hlX, hlY, a.r * 0.05, 0, 0, a.r);
  grad.addColorStop(0, pal.hi);
  grad.addColorStop(0.55, pal.fill);
  grad.addColorStop(1, pal.lo);
  ctx.fillStyle = grad;
  ctx.fill();

  // Apagar sombra para el trazo
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = isBelow ? '#1c1c1c' : isAbove ? '#585858' : pal.stroke;
  ctx.lineWidth = isAbove ? 1.2 : isBelow ? 0.5 : 0.8;
  ctx.stroke();

  ctx.restore();
}

// Llamar con above=false antes de las naves, above=true después

// Llamar con above=false antes de las naves, above=true después
function drawAsteroids(camX, camY, above = false) {
  S.asteroids.forEach(a => {
    const isAbove = (a.z ?? 0) === 1;
    if (above !== isAbove) return;
    drawOneAsteroid(a, camX, camY);
  });
}

export { drawWorldBounds, drawGrid, drawpingEffect, drawAsteroids };
