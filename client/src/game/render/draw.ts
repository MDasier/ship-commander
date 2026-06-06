// @ts-nocheck
// ── Render: interpolación + dibujo en canvas + HUD + game loop ─────────
// Todo el dibujo del cliente (naves, proyectiles, mundo, radar, HUD, marcador,
// game over, autodestrucción…) y el bucle de animación. Mantiene @ts-nocheck:
// es ~2k líneas de canvas legacy sin tipar; tiparlo en strict-off no aporta y
// arriesga regresión. Las funciones del motor que el loop necesita (bindings,
// bindingText, paneles de muerte/game over) se inyectan vía initRender().

import { S } from "../state";
import { canvas, ctx, getMe, worldToScreen } from "./canvas";
import { keys } from "../input";
import { i18nt, getLang } from "../../i18n.js";
import { setMissileWarning, playVoiceAlert } from "../../sounds.js";
import {
  spawnThrustParticle, spawnSmokeParticle,
  updateParticles, drawStars, drawParticles,
} from "../../particles.js";
import { getShapeDef, buildShipPath, drawShipDetail } from "../shapes";
import { CFG_RESPAWN_DELAY } from "../constants";
import { lerp, lerpAngle, extrapolateArr, seededRand } from "../math";
import { isSheltered, losBlocked } from "./sensors";

// ── Client-side interpolation ──────────────────
const INTERP_DELAY = 80;  // ms behind server time (~2.5 ticks at 30fps)
const MAX_BUFFER = 12;

// ── Dependencias inyectadas desde game.ts ──
let getBindings = () => ({});
let bindingText = (_action) => "";
let setDeadPanelVisible = (_v) => {};
let showGameOver = () => {};
let closeMobiglass = () => {};

export function initRender(deps) {
  getBindings = deps.getBindings;
  bindingText = deps.bindingText;
  setDeadPanelVisible = deps.setDeadPanelVisible;
  showGameOver = deps.showGameOver;
  closeMobiglass = deps.closeMobiglass;
}

// Arranca el bucle de render (RAF).
export function startRenderLoop() { loop(); }

function applyInterpolatedState() {
  if (S.stateBuffer.length === 0) return;

  const renderTime = Date.now() - INTERP_DELAY;

  // Find the two states that bracket renderTime
  let idx = 0;
  while (idx < S.stateBuffer.length - 1 && S.stateBuffer[idx + 1].time <= renderTime) idx++;

  const s0 = S.stateBuffer[idx];
  const s1 = S.stateBuffer[idx + 1];

  // Ticks elapsed since the latest state we have (for bullet/missile extrapolation)
  const latest = s1 || s0;
  const ticksSince = Math.max(0, (Date.now() - latest.time) / (1000 / 30));

  if (!s1) {
    // Only one state available — use it directly, extrapolate projectiles
    S.players = s0.players;
    S.bullets = extrapolateArr(s0.bullets, ticksSince);
    S.missiles = extrapolateArr(s0.missiles, ticksSince);
    S.flares = s0.flares;
    return;
  }

  // Interpolation factor [0,1] between s0 and s1
  const t = Math.max(0, Math.min(1, (renderTime - s0.time) / (s1.time - s0.time)));

  // Interpolate player positions and angle
  const interped = {};
  for (const id in s1.players) {
    const p1 = s1.players[id];
    const p0 = s0.players[id];
    if (!p0) { interped[id] = p1; continue; }
    interped[id] = {
      ...p1,
      x: lerp(p0.x, p1.x, t),
      y: lerp(p0.y, p1.y, t),
      angle: lerpAngle(p0.angle, p1.angle, t),
    };
  }
  S.players = interped;
  S.bullets = extrapolateArr(s1.bullets, ticksSince);
  S.missiles = extrapolateArr(s1.missiles, ticksSince);
  S.flares = s1.flares;

  // Trim buffer — keep only the last MAX_BUFFER entries
  if (S.stateBuffer.length > MAX_BUFFER) S.stateBuffer.splice(0, S.stateBuffer.length - MAX_BUFFER);
}

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
function drawAsteroids(camX, camY, above = false) {
  S.asteroids.forEach(a => {
    const isAbove = (a.z ?? 0) === 1;
    if (above !== isAbove) return;
    drawOneAsteroid(a, camX, camY);
  });
}

function drawShip(player, camX, camY) {
  // Los artilleros están dentro del gunship, no se dibujan como nave independiente
  if (player.pilotingFor) return;

  const pos = worldToScreen(player.x, player.y, camX, camY);
  const shape = getShapeDef(player.shipType);
  const eng = shape.engine;
  const maxHp = player.maxHp || 100;

  // ── Detection check for HUD elements ──────────
  const me = getMe();
  const isEnemy = me && player.team !== me.team;
  const dist = me ? Math.hypot(player.x - me.x, player.y - me.y) : 0;
  const detected = !isEnemy || dist <= (player.radarSignature || 450);

  // ── Ship body ──────────────────────────────────
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(player.angle);

  const hpFrac = Math.max(0, player.hp / maxHp);

  // Parpadeo a HP crítica (< 12%)
  if (!player.dead && hpFrac < 0.12 && Math.random() < 0.12) {
    ctx.globalAlpha = 0.55 + Math.random() * 0.45;
  }

  ctx.beginPath();
  buildShipPath(ctx, player.shipType);

  if (player.dead) {
    ctx.fillStyle = "#333";
  } else {
    // Gradiente radial descentrado → sensación de volumen (tonos oscuros)
    const sR = shape.shieldR ?? 42;
    const isGreen = player.team === "green";
    const hiColor = isGreen ? "#3fae7e" : "#c45e6e";   // realce apagado
    const midColor = isGreen ? "#0b7a47" : "#8e2233";  // metal de equipo más oscuro
    const loColor = isGreen ? "#01140c" : "#140006";   // sombra profunda
    const grad = ctx.createRadialGradient(-sR * 0.28, -sR * 0.32, sR * 0.04,
      0, 0, sR * 0.9);
    grad.addColorStop(0, hiColor);
    grad.addColorStop(0.45, midColor);
    grad.addColorStop(1, loColor);
    ctx.fillStyle = grad;
  }
  ctx.fill();
  // Contorno oscuro del casco → silueta definida
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = player.dead ? "#222" : "rgba(0,0,0,0.55)";
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Detalle interior: paneles de chasis + cabina/puente
  drawShipDetail(ctx, player.shipType, player);

  // Overlay de calor progresivo según daño recibido
  if (!player.dead && hpFrac < 0.55) {
    const heatIntensity = Math.pow((0.55 - hpFrac) / 0.55, 1.5);
    ctx.save();
    ctx.globalAlpha = heatIntensity * 0.45;
    ctx.beginPath();
    buildShipPath(ctx, player.shipType);
    ctx.fillStyle = hpFrac < 0.2 ? "#ff3300" : "#ff8800";
    ctx.fill();
    ctx.restore();
  }

  // Hit-flash white overlay
  if (player.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = (player.hitFlash / 8) * 0.85;
    ctx.beginPath();
    buildShipPath(ctx, player.shipType);
    ctx.fillStyle = "white";
    ctx.fill();
    ctx.restore();
  }

  // Escudo: arco blanco direccional al absorber impacto
  if ((player.shieldFlash ?? 0) > 0) {
    const sAlpha = player.shieldFlash / 12;
    const sR = shape.shieldR ?? 42;
    const arcSpan = 2.2; // ±63° (rad) — arco del lado impactado
    ctx.save();

    if (player.shieldHitAngle != null) {
      // Ángulo en coordenadas locales (se resta la rotación de la nave)
      const localAngle = player.shieldHitAngle - player.angle;
      // Glow exterior (trazo más ancho y tenue)
      ctx.globalAlpha = sAlpha * 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, sR, localAngle - arcSpan / 2, localAngle + arcSpan / 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 8;
      ctx.stroke();
      // Línea interior nítida
      ctx.globalAlpha = sAlpha * 0.95;
      ctx.beginPath();
      ctx.arc(0, 0, sR, localAngle - arcSpan / 2, localAngle + arcSpan / 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // Sin dirección conocida: anillo completo
      ctx.globalAlpha = sAlpha * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, sR, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── EMP: chispas rojas envolviendo a la nave apagada por el pulso EMP del Disruptor
  const emp = player.emp ?? 0;
  if (!player.dead && emp > 0.01) {
    const R = shape.shieldR ?? 60;
    ctx.save();
    // Resplandor rojo
    ctx.globalAlpha = 0.10 + 0.25 * emp;
    const g = ctx.createRadialGradient(0, 0, R * 0.45, 0, 0, R * 1.3);
    g.addColorStop(0, "#ffffff00");
    g.addColorStop(0.7, "#ff222266");
    g.addColorStop(1, "#ffffff00");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2); ctx.fill();

    // Arcos eléctricos rojos serpenteando alrededor del casco
    const arcs = Math.round(2 + emp * 6);
    ctx.strokeStyle = "#ff5566";
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.45 + 0.55 * emp;
    for (let k = 0; k < arcs; k++) {
      const a0 = Math.random() * Math.PI * 2;
      const segs = 5;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const ang = a0 + (i / segs) * (0.6 + Math.random() * 0.5);
        const rr = R * (0.95 + (Math.random() - 0.5) * 0.5);
        const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Chispas radiales
    ctx.globalAlpha = 0.3 + 0.6 * emp;
    ctx.strokeStyle = "#ffaaaa";
    ctx.lineWidth = 1.3;
    for (let k = 0; k < 5; k++) {
      const ang = Math.random() * Math.PI * 2;
      const r0 = R * 0.5, r1 = R * (1.1 + Math.random() * 0.35);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
      ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Impacto del rayo de la Capital: descarga eléctrica azul/blanca envolviendo
  //    el casco (efecto propio, distinto del rojo del EMP).
  const beamHit = (player.beamHit ?? 0) / 8; // CAPITAL_BEAM_LIFE = 8
  if (!player.dead && beamHit > 0.01) {
    const R = shape.shieldR ?? 60;
    ctx.save();
    // Resplandor azul-blanco
    ctx.globalAlpha = 0.15 + 0.4 * beamHit;
    const g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.25);
    g.addColorStop(0, "#ffffffaa");
    g.addColorStop(0.6, "#66ccffaa");
    g.addColorStop(1, "#ffffff00");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.25, 0, Math.PI * 2); ctx.fill();

    // Arcos eléctricos blancos crepitando alrededor del casco
    ctx.strokeStyle = "#cfeeff";
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.5 + 0.5 * beamHit;
    const arcs = Math.round(3 + beamHit * 5);
    for (let k = 0; k < arcs; k++) {
      const a0 = Math.random() * Math.PI * 2;
      const segs = 4;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const ang = a0 + (i / segs) * (0.5 + Math.random() * 0.6);
        const rr = R * (0.85 + (Math.random() - 0.5) * 0.6);
        const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Carga del rayo (Capital): efecto pequeño concentrado en la punta (proa)
  const charge = player.beamCharge ?? 0;
  if (!player.dead && player.shipType === "capital" && charge > 0.02) {
    const nose = shape.body[0];            // vértice frontal del casco
    const isGreen = player.team === "green";
    const col = isGreen ? "#00ff88" : "#ff3355";
    const hi = isGreen ? "#aaffdd" : "#ffd0dd";
    const full = charge >= 0.99;
    const now = performance.now();
    const baseR = 6 + charge * 9;          // orbe pequeño que crece con la carga

    ctx.save();
    ctx.translate(nose[0], nose[1]);

    // Orbe de energía
    const pulse = full ? 0.7 + 0.3 * Math.sin(now / 45) : 1;
    const orbR = baseR * pulse;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, orbR);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.5, col);
    g.addColorStop(1, "#ffffff00");
    ctx.globalAlpha = 0.55 + 0.45 * charge;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, orbR, 0, Math.PI * 2); ctx.fill();

    // Anillo de progreso de carga → lectura clara de cuánto falta
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = full ? "#ffffff" : hi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, baseR + 5, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
    ctx.stroke();

    // Pequeñas chispas alrededor del orbe
    const sparks = Math.round(2 + charge * 4);
    ctx.strokeStyle = hi;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.5 + 0.5 * charge;
    for (let k = 0; k < sparks; k++) {
      const a0 = Math.random() * Math.PI * 2;
      const r0 = orbR * 0.7, r1 = orbR * (1.2 + Math.random() * 0.6);
      const a1 = a0 + (Math.random() - 0.5) * 0.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      ctx.stroke();
    }

    // Destello blanco parpadeante al estar listo
    if (full) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 45);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(0, 0, baseR * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Engine glow (only when alive)
  if (!player.dead) {
    ctx.beginPath();
    ctx.moveTo(eng[0][0], eng[0][1]);
    ctx.lineTo(eng[1][0], eng[1][1]);
    ctx.lineTo(eng[2][0], eng[2][1]);
    ctx.strokeStyle = "#00aaff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();

  // ── Torreta del Gunship (independiente del ángulo del casco)
  if (player.shipType === "gunship" && !player.dead) {
    const hasGunner = !!player.gunnerId;
    const tAngle = player.turretAngle ?? 0;
    const tColor = player.team === "green" ? "#007744" : "#881122";
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    ctx.strokeStyle = hasGunner ? tColor : "#333";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.rotate(tAngle);
    ctx.fillStyle = hasGunner ? tColor : "#2a2a2a";
    ctx.fillRect(4, -3.5, 28, 7);
    ctx.restore();
  }

  // ── 3 Torretas de la Capital (posiciones fijas en el casco, ángulo independiente)
  if (player.shipType === "capital" && !player.dead) {
    const hardpoints = shape.turretHardpoints || [];
    const gunnerIds = player.gunnerIds || [];
    const angles = player.turretAngles || {};
    const tColor = player.team === "green" ? "#007744" : "#881122";
    const cosA = Math.cos(player.angle);
    const sinA = Math.sin(player.angle);

    hardpoints.forEach((hp, idx) => {
      const hasGunner = !!(gunnerIds[idx]);
      const tAngle = hasGunner ? (angles[gunnerIds[idx]] ?? 0) : 0;
      // Transformar hardpoint a coordenadas de pantalla
      const sx = pos.x + hp[0] * cosA - hp[1] * sinA;
      const sy = pos.y + hp[0] * sinA + hp[1] * cosA;

      ctx.save();
      ctx.translate(sx, sy);
      // Base de la torreta
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#111";
      ctx.fill();
      ctx.strokeStyle = hasGunner ? tColor : "#333";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Cañón
      ctx.rotate(tAngle);
      ctx.fillStyle = hasGunner ? tColor : "#2a2a2a";
      ctx.fillRect(3, -3, 22, 6);
      ctx.restore();
    });
  }

  // ── HUD elements (only if detected) ───────────
  if (!player.dead && detected) {
    const hw = shape.hpBarW;
    const offY = shape.uiOffY;   // negative = above ship

    const hasShield = (player.maxShield ?? 0) > 0;
    const shieldBarOffY = hasShield ? offY - 5 : offY;

    // Barra de escudo (blanca, encima de la barra de HP)
    if (hasShield) {
      const shieldFrac = Math.max(0, (player.shield ?? 0) / player.maxShield);
      ctx.fillStyle = "#111";
      ctx.fillRect(pos.x - hw / 2, pos.y + offY - 5, hw, 3);
      ctx.fillStyle = shieldFrac > 0 ? "#aaddff" : "#223344";
      ctx.fillRect(pos.x - hw / 2, pos.y + offY - 5, hw * shieldFrac, 3);
    }

    // HP bar background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(pos.x - hw / 2, pos.y + offY, hw, 4);
    // HP bar fill — color shifts red as HP drops
    const hpFrac = player.hp / maxHp;
    ctx.fillStyle = hpFrac > 0.5 ? "#00ff88" : hpFrac > 0.25 ? "#ffaa00" : "#ff3355";
    ctx.fillRect(pos.x - hw / 2, pos.y + offY, hw * hpFrac, 4);

    // Fuel bar
    ctx.fillStyle = "#00aaff44";
    ctx.fillRect(pos.x - hw / 2, pos.y + offY + 6, hw, 3);
    ctx.fillStyle = "#00aaff";
    ctx.fillRect(pos.x - hw / 2, pos.y + offY + 6, hw * (player.fuel / 100), 3);

    // Callsign (sube si hay escudo para no solapar)
    ctx.save();
    ctx.fillStyle = player.id === S.myId ? "#00ccff" : "rgba(255,255,255,0.6)";
    ctx.font = "11px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(player.name || "Pilot", pos.x, pos.y + (hasShield ? offY - 12 : offY - 6));
    ctx.restore();
  }

  // ── Target lock reticle (estilo space-sim) ──
  if (player.id === S.targetId) {
    drawTargetReticle(pos.x, pos.y, player);
  }
}

// Retículo de objetivo: anillo giratorio discontinuo + corchetes de esquina +
// cruz central + etiqueta de distancia. Sustituye al antiguo círculo amarillo.
function drawTargetReticle(sx, sy, target) {
  const now = performance.now();
  const R = 34;
  const pulse = 0.7 + 0.3 * Math.sin(now / 220);
  const col = "255,70,70"; // rojo hostil

  ctx.save();
  ctx.translate(sx, sy);

  // Anillo giratorio discontinuo
  const spin = (now / 2600) % (Math.PI * 2);
  ctx.rotate(spin);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.setLineDash([6, 10]);
  ctx.strokeStyle = `rgba(${col},${0.35 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(-spin);

  // 4 corchetes de esquina (que "respiran" con el pulso)
  const b = R + 4 + 3 * pulse;
  const len = 11;
  ctx.strokeStyle = `rgba(${col},${pulse})`;
  ctx.lineWidth = 2.5;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.moveTo(cx * b - cx * len, cy * b);
    ctx.lineTo(cx * b, cy * b);
    ctx.lineTo(cx * b, cy * b - cy * len);
    ctx.stroke();
  });

  // Cruz central tenue
  ctx.strokeStyle = `rgba(${col},${0.5 * pulse})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-5, 0); ctx.lineTo(5, 0);
  ctx.moveTo(0, -5); ctx.lineTo(0, 5);
  ctx.stroke();

  ctx.restore();

  // Etiqueta de distancia + LOCK
  const me = getMe();
  if (me) {
    const dist = Math.round(Math.hypot(target.x - me.x, target.y - me.y));
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillStyle = `rgba(${col},${pulse})`;
    ctx.fillText(`⊕ LOCK · ${dist}m`, sx, sy + b + 18);
    ctx.restore();
    ctx.textAlign = "left";
  }
}

function drawVelocityVector(player, camX, camY) {
  const speed =
    Math.hypot(
      player.vx,
      player.vy
    );
  if (speed < 0.5) return;
  const pos = worldToScreen(
    player.x,
    player.y,
    camX,
    camY
  );
  ctx.beginPath();
  ctx.moveTo(
    pos.x,
    pos.y
  );
  ctx.lineTo(
    pos.x + player.vx * 20,
    pos.y + player.vy * 20
  );
  ctx.strokeStyle = "#ffffff44";
  ctx.stroke();
}

function drawBullets(camX, camY) {
  S.bullets.forEach(b => {
    const pos = worldToScreen(
      b.x,
      b.y,
      camX,
      camY
    );
    ctx.beginPath();
    ctx.arc(
      pos.x,
      pos.y,
      3,
      0,
      Math.PI * 2
    );
    ctx.fillStyle =
      b.team === "green"
        ? "#00ff88"
        : "#ff3355";
    ctx.fill();
  });
}

// Rayo de la Capital: línea brillante con halo y chispas eléctricas, se desvanece.
function drawBeams(camX, camY) {
  S.beams.forEach(b => {
    const a = worldToScreen(b.x1, b.y1, camX, camY);
    const c = worldToScreen(b.x2, b.y2, camX, camY);
    const frac = Math.max(0, (b.life ?? 0) / (b.maxLife || 1));
    const col = b.team === "green" ? "#00ff88" : "#ff3355";

    ctx.save();
    ctx.lineCap = "round";
    // Halo exterior
    ctx.globalAlpha = 0.22 * frac;
    ctx.strokeStyle = col;
    ctx.lineWidth = 20 * frac + 6;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    // Cuerpo
    ctx.globalAlpha = 0.6 * frac;
    ctx.lineWidth = 9 * frac + 3;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    // Núcleo blanco
    ctx.globalAlpha = 0.95 * frac;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3 * frac + 1.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    // Chispas eléctricas serpenteando a lo largo del rayo
    const dx = c.x - a.x, dy = c.y - a.y;
    const nl = Math.hypot(dx, dy) || 1;
    const nx = -dy / nl, ny = dx / nl;
    ctx.globalAlpha = 0.85 * frac;
    ctx.strokeStyle = b.team === "green" ? "#cfffe6" : "#ffd6e0";
    ctx.lineWidth = 1.5;
    const segs = 12;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const j = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * 16;
      const px = a.x + dx * t + nx * j;
      const py = a.y + dy * t + ny * j;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ── Nodo de impacto en el extremo (efecto propio del rayo) ──
    if (b.hit) {
      const t = performance.now() / 1000;
      // Halo radial palpitante
      const haloR = (12 + 6 * Math.sin(t * 30)) * frac + 4;
      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, haloR * 1.8);
      grad.addColorStop(0, `rgba(255,255,255,${0.9 * frac})`);
      grad.addColorStop(0.4, `${col}cc`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = frac;
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(c.x, c.y, haloR * 1.8, 0, Math.PI * 2); ctx.fill();

      // Destellos radiales (estrella de impacto)
      ctx.globalAlpha = 0.9 * frac;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      const rays = 6;
      for (let i = 0; i < rays; i++) {
        const a2 = (i / rays) * Math.PI * 2 + t * 2;
        const len2 = haloR * (1.4 + 0.5 * Math.sin(t * 25 + i));
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(a2) * len2, c.y + Math.sin(a2) * len2);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

// Onda expansiva del pulso EMP (rojo) y de la explosión de mina (naranja).
function drawEmpPulses(camX, camY) {
  S.empPulses.forEach(e => {
    const pos = worldToScreen(e.x, e.y, camX, camY);
    const frac = Math.max(0, (e.life ?? 0) / (e.maxLife || 1));
    const prog = 1 - frac;                 // 0→1 a medida que se expande
    const radius = e.r * prog;
    const col = e.blast ? "255,150,40" : "255,40,60";
    ctx.save();
    // Anillo de choque
    ctx.globalAlpha = frac * 0.8;
    ctx.strokeStyle = `rgba(${col},1)`;
    ctx.lineWidth = 4 * frac + 1;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ctx.stroke();
    // Relleno tenue
    ctx.globalAlpha = frac * 0.15;
    ctx.fillStyle = `rgba(${col},1)`;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ctx.fill();
    // Chispas radiales
    ctx.globalAlpha = frac * 0.7;
    ctx.strokeStyle = e.blast ? "#ffddaa" : "#ff8899";
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + prog;
      ctx.beginPath();
      ctx.moveTo(pos.x + Math.cos(ang) * radius * 0.7, pos.y + Math.sin(ang) * radius * 0.7);
      ctx.lineTo(pos.x + Math.cos(ang) * radius, pos.y + Math.sin(ang) * radius);
      ctx.stroke();
    }
    ctx.restore();
  });
}

// Minas: solo visibles para el propio equipo (sigilo). Disco parpadeante.
function drawMines(camX, camY) {
  const me = getMe();
  const myTeam = me ? me.team : null;
  const now = performance.now();
  S.mines.forEach(mn => {
    if (mn.team !== myTeam) return;        // ocultas a los enemigos
    const pos = worldToScreen(mn.x, mn.y, camX, camY);
    const armed = (mn.arm ?? 0) <= 0;
    const blink = 0.5 + 0.5 * Math.sin(now / (armed ? 120 : 300));
    const col = mn.team === "green" ? "#00ff88" : "#ff3355";
    ctx.save();
    // Cuerpo
    ctx.fillStyle = "#161616";
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Luz parpadeante (roja si aún no armada, color de equipo si armada)
    ctx.globalAlpha = blink;
    ctx.fillStyle = armed ? col : "#ffaa00";
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2); ctx.fill();
    // Anillo tenue del radio de disparo (referencia para el dueño)
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 60, 0, Math.PI * 2); ctx.stroke();

    // Temporizador circular: anillo que se vacía a medida que se agota la vida de la mina
    const lifeFrac = Math.max(0, Math.min(1, (mn.life ?? 0) / (mn.maxLife || 1)));
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    // Pista de fondo
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2); ctx.stroke();
    // Arco de vida restante (empieza arriba y decrece en sentido horario)
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = lifeFrac < 0.25 ? "#ff4455" : lifeFrac < 0.5 ? "#ffaa00" : col;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 10, -Math.PI / 2, -Math.PI / 2 + lifeFrac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

// HUD del modo oleadas: indicador de oleada/enemigos + banner central temporal.
function drawWaveHud() {
  if (!S.waveMode) return;

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillStyle = "#ff8899";
  const label = S.waveNum > 0 ? i18nt("hud.waveLabel", { n: S.waveNum, total: S.waveTotal }) : i18nt("hud.preparing");
  const vidas = S.teamLives != null ? `  ·  ${i18nt("game.teamLives")}: ${"♥".repeat(Math.max(0, S.teamLives)) || "0"}` : "";
  ctx.fillText(`${label}  ·  ${i18nt("hud.enemiesShort")}: ${S.enemiesLeft}${vidas}`, canvas.width / 2, 70);
  ctx.restore();

  if (S.waveBanner) {
    const t = Date.now() - S.waveBannerShownAt;
    const dur = 2600;
    if (t < dur) {
      const a = t < 300 ? t / 300 : (t > dur - 600 ? Math.max(0, (dur - t) / 600) : 1);
      const boss = S.waveBanner.key === "wave.boss";
      ctx.save();
      ctx.textAlign = "center";
      ctx.globalAlpha = a;
      ctx.fillStyle = boss ? "#ff3355" : "#ffcc44";
      ctx.font = "bold 44px 'Courier New', monospace";
      ctx.shadowColor = boss ? "#ff335588" : "#ffcc4488";
      ctx.shadowBlur = 24;
      ctx.fillText(i18nt(S.waveBanner.key, { n: S.waveBanner.n }), canvas.width / 2, canvas.height * 0.28);
      ctx.restore();
      ctx.textAlign = "left";
    }
  }
}

// HUD del Interceptor: hasta 4 ranuras de mina, cada una con un anillo circular que
// muestra el tiempo de vida restante de la mina activa (o vacía si no hay).
function drawMineTimers() {
  const me = getMe();
  if (!me || me.dead || me.shipType !== "interceptor" || me.pilotingFor) return;

  const myMines = S.mines.filter(m => m.ownerId === S.myId);
  const SLOTS = 4; // = CFG.MINE_MAX_ACTIVE en el servidor
  const total = Math.max(SLOTS, myMines.length);
  const r = 11, gap = 30;
  const cx0 = canvas.width / 2 - ((total - 1) * gap) / 2;
  const cy = canvas.height - 70;
  const col = me.team === "green" ? "#00ff88" : "#ff3355";

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "12px 'Courier New', monospace";
  ctx.fillStyle = "#88aab0";
  ctx.fillText("MINAS", canvas.width / 2, cy - r - 8);

  for (let i = 0; i < total; i++) {
    const x = cx0 + i * gap;
    const mine = myMines[i];

    // Pista de fondo
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff22";
    ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.stroke();

    if (mine) {
      const armed = (mine.arm ?? 0) <= 0;
      const lifeFrac = Math.max(0, Math.min(1, (mine.life ?? 0) / (mine.maxLife || 1)));
      ctx.lineWidth = 3;
      ctx.strokeStyle = lifeFrac < 0.25 ? "#ff4455" : lifeFrac < 0.5 ? "#ffaa00" : col;
      ctx.beginPath();
      ctx.arc(x, cy, r, -Math.PI / 2, -Math.PI / 2 + lifeFrac * Math.PI * 2);
      ctx.stroke();
      // Centro: parpadea naranja mientras se arma, color de equipo al estar armada
      ctx.fillStyle = armed ? col : "#ffaa00";
      ctx.beginPath(); ctx.arc(x, cy, 3.5, 0, Math.PI * 2); ctx.fill();
      // Segundos restantes (FPS del servidor = 60)
      ctx.fillStyle = "#cfd8e3";
      ctx.fillText(String(Math.ceil((mine.life ?? 0) / 60)), x, cy + r + 13);
    } else {
      ctx.fillStyle = "#ffffff22";
      ctx.beginPath(); ctx.arc(x, cy, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  ctx.textAlign = "left";
}


//MISILES
// ── Cover helpers ─────────────────────────────
// Distancia mínima de un punto al segmento A→B (igual que servidor)

// Sensores (isSheltered / losBlocked / radarVisibleEnemies / cycleTarget*) en
// game/render/sensors.ts (tipado).

function drawMissiles(camX, camY) {

  S.missiles.forEach(m => {

    const pos = worldToScreen(m.x, m.y, camX, camY);
    const angle = Math.atan2(m.vy, m.vx);
    const s = m.torpedo ? 1.7 : 1;   // los torpedos son más grandes

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.scale(s, s);

    // Exhaust glow
    const grad = ctx.createRadialGradient(-7, 0, 0, -7, 0, 9);
    grad.addColorStop(0, "rgba(255,120,0,0.85)");
    grad.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(-6, 0, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = m.torpedo ? "#ff8844" : "#ffcc44";
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tip
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(8, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

  });

}
function drawFlares(camX, camY) {

  S.flares.forEach(f => {

    const pos = worldToScreen(f.x, f.y, camX, camY);

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 25, 0, Math.PI * 2);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();

    ctx.strokeStyle = "#ffffff88";
    ctx.stroke();

  });

}
function updateUI() {
  // El botón "Go"/ready vive ahora en React (Room.tsx); guardamos por si el
  // elemento legacy ya no existe.
  const readyBtn = document.getElementById("ready");
  if (readyBtn) readyBtn.disabled = S.uiState !== "inRoom";
}

//RADAR
function drawRadar() {
  const scanning = performance.now() < S.scanUntil;
  const size = 140;

  const x = canvas.width - 170;
  const y = canvas.height - 170;
  const r = size / 2;

  // Fondo radar
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();

  // Pulsos
  const pulse1 = (performance.now() * 0.015) % r;
  const pulse2 = (pulse1 + r / 0.5) % r;

  ctx.save();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();

  drawRadarPulse(x, y, pulse1);
  drawRadarPulse(x, y, pulse2);

  ctx.restore();

  // Retícula radar
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.arc(x, y, r * 0.33, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, r * 0.66, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();

  // Marco exterior
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.stroke();

  const me = getMe();

  Object.values(S.players).forEach(p => {

    // Enemigos: filtro de radar (firma, cobertura de asteroide, LOS)
    if (me && p.team !== me.team) {
      const pinging = performance.now() < S.pingEnemiesUntil;
      if (pinging) {
        // Ping activo: solo bypass de rango. Cobertura física sigue bloqueando.
        if (isSheltered(p.x, p.y)) return;
        if (losBlocked(me.x, me.y, p.x, p.y)) return;
      } else {
        const dist = Math.hypot(p.x - me.x, p.y - me.y);
        if (dist > (p.radarSignature || 450)) return;
        if (isSheltered(p.x, p.y)) return;
        if (losBlocked(me.x, me.y, p.x, p.y)) return;
      }
    }

    const rx = x + ((p.x / S.world.width) - 0.5) * size;
    const ry = y + ((p.y / S.world.height) - 0.5) * size;

    const blipR =
      p.shipType === "bomber" ? 5 :
        p.shipType === "interceptor" ? 2.5 :
          3.5;

    ctx.beginPath();
    ctx.arc(rx, ry, blipR, 0, Math.PI * 2);

    ctx.fillStyle =
      p.dead ? "#555" :
        p.id === S.myId ? "#00ccff" :
          p.team === "green" ? "#00ff88" :
            "#ff3355";

    ctx.fill();
  });
  if (scanning) {
    // ── Asteroids on radar
    S.asteroids.forEach(a => {

      const rx = x + (a.x / S.world.width - 0.5) * size;
      const ry = y + (a.y / S.world.height - 0.5) * size;

      ctx.beginPath();
      ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);

      ctx.fillStyle = "#666";
      ctx.fill();
    });
  }

}
function drawRadarPulse(x, y, radius) {

  const gradient = ctx.createRadialGradient(
    x,
    y,
    Math.max(0, radius - 25),
    x,
    y,
    radius + 25
  );

  gradient.addColorStop(0.00, "rgba(0,255,255,0)");
  gradient.addColorStop(0.60, "rgba(0,255,255,0.02)");
  gradient.addColorStop(0.80, "rgba(0,255,255,0.06)");
  gradient.addColorStop(0.92, "rgba(0,255,255,0.12)");
  gradient.addColorStop(1.00, "rgba(0, 255, 255, 0.4)");

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWarningOverlay(me) {

  if (!me || !me.lockedByMissile) return;
  if (!me || me.lockedOnMe <= 0) return;

  const t = Date.now() * 0.01;
  const pulse = (Math.sin(t) + 1) / 2; // 0 → 1
  const intensity = Math.min(me.lockedOnMe / 3, 1);
  const margin = 25;
  const len = 80;

  ctx.save();

  ctx.strokeStyle = `rgba(255,0,0,${0.2 + intensity})`;
  ctx.lineWidth = 4;

  // TOP LEFT
  ctx.beginPath();
  ctx.moveTo(margin, margin + len);
  ctx.lineTo(margin, margin);
  ctx.lineTo(margin + len, margin);
  ctx.stroke();

  // TOP RIGHT
  ctx.beginPath();
  ctx.moveTo(canvas.width - margin - len, margin);
  ctx.lineTo(canvas.width - margin, margin);
  ctx.lineTo(canvas.width - margin, margin + len);
  ctx.stroke();

  // BOTTOM LEFT
  ctx.beginPath();
  ctx.moveTo(margin, canvas.height - margin - len);
  ctx.lineTo(margin, canvas.height - margin);
  ctx.lineTo(margin + len, canvas.height - margin);
  ctx.stroke();

  // BOTTOM RIGHT
  ctx.beginPath();
  ctx.moveTo(canvas.width - margin - len, canvas.height - margin);
  ctx.lineTo(canvas.width - margin, canvas.height - margin);
  ctx.lineTo(canvas.width - margin, canvas.height - margin - len);
  ctx.stroke();

  ctx.shadowColor = "red";
  ctx.shadowBlur = 20;

  ctx.restore();
}
function updateTimer(secs) {
  // El HUD vive en React (montado solo en partida); búsqueda perezosa + guard.
  const timerEl = document.getElementById("timer");
  if (!timerEl) return;
  if (secs == null) { timerEl.textContent = "--:--"; return; }
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  timerEl.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  timerEl.classList.toggle("warning", secs <= 60 && secs > 15);
  timerEl.classList.toggle("danger", secs <= 15);
}

function updateHUD(me) {
  // Artillero: muestra stats del casco del piloto
  const ship = me.pilotingFor ? (S.players[me.pilotingFor] || me) : me;

  // ── Avisos de voz (voz robótica femenina), disparados por flanco ──
  if (typeof playVoiceAlert === "function" && !me.dead) {
    const lang = (typeof getLang === "function") ? getLang() : "es";
    // Combustible bajo (< 25 %) con histéresis para no repetir
    if (ship.fuel < 25) {
      if (!S.voiceFuelLow) { S.voiceFuelLow = true; playVoiceAlert(i18nt("voice.lowFuel"), lang); }
    } else if (ship.fuel > 32) { S.voiceFuelLow = false; }
    // Escudos caídos (solo naves con escudo)
    if ((ship.maxShield ?? 0) > 0 && (ship.shield ?? 0) <= 0) {
      if (!S.voiceShieldDown) { S.voiceShieldDown = true; playVoiceAlert(i18nt("voice.shieldsDown"), lang); }
    } else if ((ship.shield ?? 0) > 0) { S.voiceShieldDown = false; }
  } else {
    S.voiceFuelLow = false; S.voiceShieldDown = false;
  }

  // El HUD vive en React y solo está montado en partida (ruta /game). Si aún no
  // existe (transición), salimos: los campos de abajo asumen que el DOM está.
  const hpEl = document.getElementById("hp");
  if (!hpEl) return;
  hpEl.textContent = Math.floor(ship.hp);

  const shieldEl = document.getElementById("shieldEl");
  if (shieldEl) {
    const shieldVal = Math.floor(ship.shield ?? 0);
    const maxShield = ship.maxShield ?? 0;
    if (maxShield <= 0) {
      shieldEl.textContent = "—";
      shieldEl.style.color = "";
    } else if (shieldVal <= 0) {
      shieldEl.textContent = "0/" + maxShield;
      shieldEl.style.color = "#334455";
    } else if (shieldVal < maxShield * 0.35) {
      shieldEl.textContent = shieldVal + "/" + maxShield;
      shieldEl.style.color = "#5588aa";
    } else {
      shieldEl.textContent = shieldVal + "/" + maxShield;
      shieldEl.style.color = "#aaddff";
    }
  }

  document.getElementById("fuel").textContent =
    Math.floor(ship.fuel);

  document.getElementById("speed").textContent =
    Math.floor(Math.hypot(ship.vx, ship.vy));

  document.getElementById("kd").textContent =
    (me.kills || 0) + "/" + (me.deaths || 0);

  document.getElementById("mslCd").textContent =
    me.missileCooldown > 0
      ? Math.ceil(me.missileCooldown / 30) + "s"
      : i18nt("common.ready");

  // Bengalas restantes (pool por vida). El artillero no gestiona bengalas.
  const flaresEl = document.getElementById("flaresEl");
  if (flaresEl) {
    if (me.pilotingFor || me.maxFlares == null) {
      flaresEl.textContent = "—";
      flaresEl.style.color = "";
    } else {
      const left = me.flaresLeft ?? 0;
      flaresEl.textContent = left + "/" + me.maxFlares;
      flaresEl.style.color = left === 0 ? "#ff4455" : left <= 2 ? "#ffaa00" : "#aaddff";
    }
  }

  const inertiaEl = document.getElementById("inertiaMode");
  if (inertiaEl) {
    inertiaEl.textContent = S.inertiaDampActive ? i18nt("hud.coupled") : i18nt("hud.decoupled");
    inertiaEl.style.color = S.inertiaDampActive ? "#555" : "#8aa8b8";
  }

  const heatEl = document.getElementById("weaponHeatEl");
  if (heatEl) {
    const heatPct = Math.round(S.weaponHeat);
    if (heatPct === 0) {
      heatEl.textContent = i18nt("hud.cold");
      heatEl.style.color = "#555";
    } else if (heatPct < 50) {
      heatEl.textContent = heatPct + "%";
      heatEl.style.color = "#ffcc00";
    } else {
      heatEl.textContent = heatPct + "% ▲";
      heatEl.style.color = "#ff4444";
    }
  }

  // Habilidad especial [X]: EMP (Disruptor) / mina (Interceptor)
  const abilityRow = document.getElementById("abilityRow");
  if (abilityRow) {
    const hasAbility = !me.pilotingFor && (me.shipType === "emp" || me.shipType === "interceptor");
    abilityRow.style.display = hasAbility ? "" : "none";
    if (hasAbility) {
      const isEmp = me.shipType === "emp";
      const cd = isEmp ? (me.empCooldown ?? 0) : (me.mineCooldown ?? 0);
      document.getElementById("abilityName").textContent = isEmp ? "EMP" : "MINA";
      const cdEl = document.getElementById("abilityCd");
      if (cd > 0) {
        cdEl.textContent = Math.ceil(cd / 60) + "s";
        cdEl.style.color = "#777";
      } else {
        cdEl.textContent = i18nt("common.ready");
        cdEl.style.color = me.team === "green" ? "#00ff88" : "#ff5577";
      }
    }
  }

  const alive =
    Object.values(S.players)
      .filter(p => !p.dead)
      .length;

  document.getElementById("alive").textContent = i18nt("hud.alive", { n: alive });

  if (S.targetId) {
    const t = S.players[S.targetId];
    if (t) {
      ctx.fillStyle = "yellow";
      ctx.font = "20px Arial";
      ctx.fillText(
        "LOCK: " + (t.name || t.id.slice(0, 6)),
        40,
        220
      );
    }
  }
}

function loop() {

  applyInterpolatedState();   // compute positions interpolated to now - INTERP_DELAY

  // Auto-clear target lock: si yo estoy muerto, si el objetivo muere o se esconde
  // bajo cobertura de asteroide. Perder el lock al morir evita reaparecer con el
  // objetivo que tenías antes.
  if (S.targetId) {
    const tgt = S.players[S.targetId];
    const mePl = S.players[S.myId];
    if (!mePl || mePl.dead || !tgt || tgt.dead ||
      (isSheltered(tgt.x, tgt.y) || losBlocked(mePl.x, mePl.y, tgt.x, tgt.y))) {
      S.targetId = null;
    }
  }

  updateParticles();

  const me = getMe();

  // ── Camera: spectator or normal
  let camX, camY;
  if (me && me.dead) {
    let spec = S.specTargetId ? S.players[S.specTargetId] : null;
    if (!spec || spec.dead) {
      const living = Object.values(S.players).filter(p => !p.dead && p.id !== S.myId);
      spec = living[0] || null;
      S.specTargetId = spec ? spec.id : null;
    }
    camX = spec ? spec.x : me.x;
    camY = spec ? spec.y : me.y;
  } else if (me) {
    camX = me.x;
    camY = me.y;
    S.specTargetId = null;
  } else {
    camX = 0; camY = 0;
  }

  // ── Screen shake
  if (S.shakeMag > 0.5) {
    camX += (Math.random() - 0.5) * S.shakeMag;
    camY += (Math.random() - 0.5) * S.shakeMag;
    S.shakeMag *= 0.82;
  } else {
    S.shakeMag = 0;
  }

  // ── Thrust particles for local player (no para artilleros)
  const bindings = getBindings();
  if (me && !me.dead && !me.pilotingFor && bindings.thrust && keys[bindings.thrust]) {
    spawnThrustParticle(me.x, me.y, me.angle);
  }

  // ── Humo de daño para todas las naves con HP bajo (lado trasero)
  Object.values(S.players).forEach(p => {
    if (p.dead || p.pilotingFor) return;
    const hf = p.hp / (p.maxHp || 100);
    if (hf >= 0.55) return;
    // Probabilidad proporcional al daño: más daño = más humo
    const smokeProbability = hf < 0.15 ? 0.55 : hf < 0.30 ? 0.25 : 0.08;
    if (Math.random() > smokeProbability) return;
    // Emitir desde la parte trasera de la nave
    const smokeX = p.x + Math.cos(p.angle + Math.PI) * 18;
    const smokeY = p.y + Math.sin(p.angle + Math.PI) * 18;
    // intensidad 0→1 según gravedad del daño
    const intensity = Math.max(0, (0.55 - hf) / 0.55);
    spawnSmokeParticle(smokeX, smokeY, intensity);
  });

  // Background
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStars(ctx, camX, camY);

  if (me) drawWarningOverlay(me);

  drawWorldBounds(camX, camY);
  drawGrid(camX, camY);
  drawAsteroids(camX, camY, false); // z=0 y z=-1 (debajo de las naves)

  drawMines(camX, camY);            // minas bajo las naves (solo equipo propio)

  Object.values(S.players).forEach(p => drawVelocityVector(p, camX, camY));
  Object.values(S.players).forEach(p => drawShip(p, camX, camY));

  drawParticles(ctx, camX, camY);
  drawBullets(camX, camY);
  drawBeams(camX, camY);
  drawEmpPulses(camX, camY);        // ondas EMP / explosiones de mina
  drawMissiles(camX, camY);
  drawFlares(camX, camY);

  drawAsteroids(camX, camY, true);  // z=1 (por encima de las naves)

  drawpingEffect(camX, camY);

  drawRadar();
  drawMineTimers();
  drawWaveHud();

  if (me) {
    updateHUD(me);
    const pilot = me.pilotingFor ? S.players[me.pilotingFor] : null;
    setMissileWarning(!me.dead && !!(me.lockedByMissile || pilot?.lockedByMissile));

    if (me.dead) {
      //if (!deadPanel.classList.contains("hidden")) renderDeadTurretOptions();
      const reservedPilot = me.pilotingFor ? S.players[me.pilotingFor] : null;
      const inTurret = !!(reservedPilot && !reservedPilot.dead);

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 40px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(i18nt("game.destroyed"), canvas.width / 2, canvas.height / 2 - 30);
      // Vidas: oleadas → pool de equipo; PVP/vuelo libre → infinito
      const canRespawn = S.waveMode ? (S.teamLives ?? 0) > 0 : true;
      // El panel de muerte lo monta React (evento "dead"); aquí solo ajustamos
      // visibilidad (dedupe) y dibujamos la cuenta atrás de reaparición en canvas.
      setDeadPanelVisible(canRespawn);
      if (canRespawn) {
        const elapsed = S.clientDeadAt ? Date.now() - S.clientDeadAt : 99999;
        const remaining = Math.max(0, Math.ceil((CFG_RESPAWN_DELAY * 1000 - elapsed) / 1000));
        ctx.font = "15px 'Courier New', monospace";
        if (remaining > 0) {
          ctx.fillStyle = "#aaa";
          ctx.fillText(i18nt("game.respawnIn", { n: remaining }), canvas.width / 2, canvas.height / 2 + 16);
        } else {
          ctx.fillStyle = "#00ff88";
          const respawnKey = bindingText("respawn");

          const accion = inTurret
            ? i18nt("game.respawnTurret", { key: respawnKey, name: reservedPilot.name || i18nt("game.ally") })
            : i18nt("game.pressRespawn", { key: respawnKey });
          ctx.fillText(accion, canvas.width / 2, canvas.height / 2 + 16);
        }
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillStyle = "#666";
        const vidasTxt = S.waveMode
          ? i18nt("game.teamLivesN", { n: S.teamLives })
          : i18nt("game.respawnsInf");
        ctx.fillText(`${vidasTxt}  ·  ${inTurret ? i18nt("game.chooseShipTurret") : i18nt("game.chooseShip")}`,
          canvas.width / 2, canvas.height / 2 + 38);
      } else {
        ctx.font = "13px 'Courier New', monospace";
        ctx.fillStyle = "#666";
        ctx.fillText(i18nt("game.noTeamLives"), canvas.width / 2, canvas.height / 2 + 16);
      }
      ctx.textAlign = "left";
    } else {
      setDeadPanelVisible(false);
    }

    // Aviso de nave apagada por EMP
    if (!me.dead && me.empDisabled) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 26px 'Courier New', monospace";
      ctx.fillStyle = `rgba(255,70,90,${0.6 + 0.4 * Math.sin(performance.now() / 90)})`;
      ctx.fillText(i18nt("game.systemsDown"), canvas.width / 2, canvas.height / 2 - 70);
      ctx.restore();
      ctx.textAlign = "left";
    }
  }

  if (S.winner) {

    if (S.winner !== S.prevWinner) {
      S.prevWinner = S.winner;

      clearTimeout(S.gameOverTimer);
      S.gameOverTimer = setTimeout(() => {
        showGameOver();
      }, 2500);

      if (S.mobiOpen) closeMobiglass();
    }

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.textAlign = "center";

    ctx.fillStyle = S.winner === "draw" ? "#ffcc00" : S.winner === "green" ? "#00ff88" : "#ff3355";
    ctx.font = "bold 52px 'Courier New', monospace";
    let resultText;
    if (S.waveMode) {
      // Modo oleadas: resultado de práctica (sin equipos)
      resultText = S.winner === "green" ? i18nt("result.wavesWon") : i18nt("result.wavesLost");
    } else {
      resultText = S.winner === "draw"
        ? i18nt("result.draw")
        : (S.winner === "green" ? i18nt("result.greenWins") : i18nt("result.redWins"));
    }
    ctx.fillText(resultText, cx, cy - 90);

    const sorted = Object.values(S.players).sort((a, b) => {
      if (a.team !== b.team) return a.team === S.winner ? -1 : 1;
      return (b.kills || 0) - (a.kills || 0);
    });

    ctx.font = "11px 'Courier New', monospace";
    ctx.fillStyle = "#333";
    ctx.fillText("──────────────────────────────────────────────", cx, cy - 48);
    ctx.fillStyle = "#444";
    ctx.fillText("PILOTO             K   D   A    DMG", cx, cy - 32);

    sorted.forEach((p, i) => {
      ctx.fillStyle = p.team === "green" ? "#00ff88" : "#ff3355";
      const name = (p.name || "Pilot").slice(0, 12).padEnd(12);
      const k = String(p.kills || 0).padStart(3);
      const d = String(p.deaths || 0).padStart(3);
      const a = String(p.assists || 0).padStart(3);
      const dmg = String(Math.round(p.damageDealt || 0)).padStart(5);
      const me_m = p.id === S.myId ? " ◄" : "";
      ctx.fillText(name + "    " + k + " " + d + " " + a + " " + dmg + me_m, cx, cy - 6 + i * 24);
    });

    ctx.textAlign = "left";
  }

  // ── Self-destruct UI
  if (sdState === "charging") {
    const progress = Math.min(1, (Date.now() - sdHoldStart) / 2000);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 80;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(cx - 160, cy - 36, 320, 44);
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillStyle = "#ff6666";
    ctx.fillText(i18nt("game.selfDestructHold", { key: "DEL" }), cx, cy - 16);
    ctx.fillStyle = "#222";
    ctx.fillRect(cx - 130, cy - 4, 260, 8);
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(cx - 130, cy - 4, 260 * progress, 8);
    ctx.restore();
  }

  if (sdState === "countdown") {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.save();
    // Red tint on edges
    const pulse = 0.04 + 0.04 * Math.sin(Date.now() * 0.008);
    ctx.fillStyle = `rgba(180,0,0,${pulse})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Box
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(cx - 170, cy - 90, 340, 130);
    ctx.strokeStyle = "#ff2222";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 170, cy - 90, 340, 130);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff4444";
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillText(i18nt("game.selfDestructWarn"), cx, cy - 62);
    ctx.fillStyle = "#ff2222";
    ctx.font = `bold ${70 + (5 - sdCountdown) * 4}px 'Courier New', monospace`;
    ctx.fillText(sdCountdown, cx, cy + 12);
    ctx.fillStyle = "#555";
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText(i18nt("game.selfDestructCancel", { key: "DEL" }), cx, cy + 36);
    ctx.restore();
  }

  // ── Kill feed (top-right, below alive counter)
  const now = Date.now();
  const recentKills = S.killFeed.filter(e => now - e.time < 5000);
  if (recentKills.length > 0) {
    ctx.save();
    ctx.font = "12px 'Courier New', monospace";
    ctx.textAlign = "right";
    recentKills.forEach((e, i) => {
      const age = now - e.time;
      const alpha = age < 3500 ? 1 : 1 - (age - 3500) / 1500;
      ctx.globalAlpha = Math.max(0, alpha);
      const kColor = e.killerTeam === "green" ? "#00ff88" : (e.killerTeam === "red" ? "#ff3355" : "#888");
      const vColor = e.victimTeam === "green" ? "#00ff88" : "#ff3355";
      const icons = { missile: "⬥", asteroid: "✦", self: "☠", bullet: "·" };
      const icon = icons[e.weapon] || "·";
      const y = 90 + i * 20;

      if (e.weapon === "self") {
        ctx.fillStyle = vColor;
        ctx.fillText(e.victimName, canvas.width - 24, y);
        ctx.fillStyle = "#555";
        ctx.fillText(" ☠", canvas.width - 24 - ctx.measureText(e.victimName).width, y);
      } else if (e.killerName) {
        ctx.fillStyle = "#555";
        ctx.fillText(icon, canvas.width - 16, y);
        ctx.fillStyle = vColor;
        ctx.fillText(e.victimName, canvas.width - 24, y);
        ctx.fillStyle = "#555";
        ctx.fillText(" ← ", canvas.width - 24 - ctx.measureText(e.victimName).width, y);
        ctx.fillStyle = kColor;
        ctx.fillText(e.killerName, canvas.width - 24 - ctx.measureText(e.victimName).width - ctx.measureText(" ← ").width, y);
      } else {
        ctx.fillStyle = "#555";
        ctx.fillText(icon, canvas.width - 16, y);
        ctx.fillStyle = vColor;
        ctx.fillText(e.victimName, canvas.width - 24, y);
      }
    });
    ctx.restore();
  }

  // ── Chat log (bottom-left)
  const recentChat = S.chatLog.filter(m => now - m.ts < 7000);

  if (recentChat.length > 0) {
    ctx.save();
    ctx.font = "12px 'Courier New', monospace";
    ctx.textAlign = "left";

    recentChat.forEach((m, i) => {
      const age = now - m.ts;
      const alpha = age < 5000 ? 0.9 : 0.9 * (1 - (age - 5000) / 2000);

      ctx.globalAlpha = Math.max(0, alpha);

      const teamColor = m.team === "green" ? "#00ff88" : "#ff3355";
      const y = canvas.height - 70 - (recentChat.length - 1 - i) * 22;

      ctx.fillStyle = teamColor;

      const nameTag = "[" + m.name + "] ";

      ctx.fillText(nameTag, 20, y);

      ctx.fillStyle = "#ccc";

      ctx.fillText(
        m.text,
        20 + ctx.measureText(nameTag).width,
        y
      );
    });

    ctx.restore();
  }
  // ── Chat indicator
  if (S.chatLog.length > 0) {

    ctx.save();

    const pulse =
      0.5 + Math.sin(performance.now() * 0.005) * 0.4;

    ctx.globalAlpha =
      recentChat.length === 0
        ? pulse
        : 0.7;

    ctx.font = "11px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#00ccff";

    ctx.fillText(
      "[Enter] Chat",
      20,
      canvas.height - 30
    );

    ctx.restore();
  }

  // ── Spectator indicator
  if (me && me.dead && S.specTargetId) {
    const spec = S.players[S.specTargetId];
    if (spec) {
      ctx.save();
      ctx.font = "12px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(canvas.width / 2 - 180, canvas.height - 44, 360, 24);
      ctx.fillStyle = "#aaa";
      ctx.fillText(i18nt("game.spectator", { name: spec.name || "Pilot" }), canvas.width / 2, canvas.height - 27);
      ctx.restore();
    }
  }

  // El contenido del MobiGlass lo renderiza React (lee getMe/getPlayers al abrir).

  // ── Scoreboard (Tab mantenido)
  if (S.showScoreboard) {
    const rem = 18; // 1rem base

    const green = Object.values(S.players)
      .filter(p => p.team === "green")
      .sort((a, b) => (b.kills || 0) - (a.kills || 0));

    const red = Object.values(S.players)
      .filter(p => p.team === "red")
      .sort((a, b) => (b.kills || 0) - (a.kills || 0));

    const maxRows = Math.max(green.length, red.length, 1);

    // ── ESCALADO MÁS GRANDE ──
    const rowH = rem * 1.8;
    const titleH = rem * 3;
    const teamH = rem * 1.6;
    const colH = rem * 1.4;

    const bh = titleH + teamH + colH + maxRows * rowH + rem;
    const bw = Math.min(canvas.width * 0.95, 1100); // más ancho
    const bx = (canvas.width - bw) / 2;
    const by = Math.max(20, (canvas.height - bh) / 2);
    const colW = bw / 2;

    ctx.save();

    // Panel
    ctx.fillStyle = "rgba(0,2,8,0.94)";
    ctx.fillRect(bx, by, bw, bh);

    ctx.strokeStyle = "#00ccff22";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);

    // Divisor central
    ctx.beginPath();
    ctx.moveTo(bx + colW, by + titleH);
    ctx.lineTo(bx + colW, by + bh);
    ctx.strokeStyle = "#ffffff10";
    ctx.stroke();

    // ── TÍTULO ──
    ctx.textAlign = "center";
    ctx.font = `bold ${rem}px 'Courier New', monospace`;
    ctx.fillStyle = "#00ccff66";
    ctx.fillText(
      "MARCADOR · Suelta Tab para cerrar",
      canvas.width / 2,
      by + rem * 1.4
    );

    // ── TOTALES ──
    const sum = (arr, key) => arr.reduce((s, p) => s + (p[key] || 0), 0);

    const gAlive = green.filter(p => !p.dead).length;
    const rAlive = red.filter(p => !p.dead).length;

    ctx.font = `bold ${rem}px 'Courier New', monospace`;

    ctx.textAlign = "left";
    ctx.fillStyle = "#00ff88";
    ctx.fillText(
      `▶ VERDE ${gAlive}/${green.length} vivos  ${sum(green, "kills")}K  ${sum(green, "assists")}A  ${Math.round(sum(green, "damageDealt"))} dmg`,
      bx + rem,
      by + rem * 2.4
    );

    ctx.textAlign = "right";
    ctx.fillStyle = "#ff3355";
    ctx.fillText(
      `${sum(red, "kills")}K  ${sum(red, "assists")}A  ${Math.round(sum(red, "damageDealt"))} dmg  ${rAlive}/${red.length} vivos ◀ ROJO`,
      bx + bw - rem,
      by + rem * 2.4
    );

    // ── CABECERAS ──
    const hy = by + titleH + teamH + colH - rem * 0.2;

    ctx.font = `${rem * 0.9}px 'Courier New', monospace`;
    ctx.fillStyle = "#2b5a6b";

    ctx.textAlign = "left";
    ctx.fillText("PILOTO", bx + rem * 1.4, hy);

    ctx.textAlign = "right";
    ctx.fillText("K   D   A    DMG", bx + colW - rem, hy);

    ctx.textAlign = "left";
    ctx.fillText("PILOTO", bx + colW + rem * 1.4, hy);

    ctx.textAlign = "right";
    ctx.fillText("K   D   A    DMG", bx + bw - rem, hy);

    // Separador
    ctx.beginPath();
    ctx.moveTo(bx, hy + rem * 0.3);
    ctx.lineTo(bx + bw, hy + rem * 0.3);
    ctx.strokeStyle = "#ffffff10";
    ctx.stroke();

    const rowStart = by + titleH + teamH + colH;

    [green, red].forEach((team, ti) => {
      const lx = ti === 0 ? bx + rem : bx + colW + rem;
      const rx = ti === 0 ? bx + colW - rem : bx + bw - rem;
      const tColor = ti === 0 ? "#00ff88" : "#ff3355";

      team.forEach((p, i) => {
        const ry = rowStart + i * rowH + rowH * 0.75;
        const isMe = p.id === S.myId;

        // highlight jugador
        if (isMe) {
          ctx.fillStyle = "rgba(0,204,255,0.08)";
          ctx.fillRect(
            ti === 0 ? bx : bx + colW,
            rowStart + i * rowH,
            colW,
            rowH
          );
        }

        ctx.globalAlpha = p.dead ? 0.35 : 1;

        // indicador
        ctx.textAlign = "left";
        ctx.font = `${rem}px 'Courier New', monospace`;
        ctx.fillStyle = p.dead ? "#444" : tColor;
        ctx.fillText(p.dead ? "✕" : "●", lx, ry);

        // nombre
        ctx.font = `${isMe ? "bold " : ""}${rem}px 'Courier New', monospace`;
        ctx.fillStyle = isMe ? "#00ccff" : (p.dead ? "#444" : "#ddd");
        ctx.fillText((p.name || "Pilot").slice(0, 12), lx + rem * 0.9, ry);

        // stats
        ctx.textAlign = "right";
        ctx.font = `${rem}px 'Courier New', monospace`;
        ctx.fillStyle = p.dead ? "#444" : "#9ab";

        const k = String(p.kills || 0).padStart(2);
        const d = String(p.deaths || 0).padStart(2);
        const a = String(p.assists || 0).padStart(2);
        const dmg = String(Math.round(p.damageDealt || 0)).padStart(5);

        ctx.fillText(`${k}  ${d}  ${a}  ${dmg}`, rx, ry);

        ctx.globalAlpha = 1;
      });
    });

    ctx.restore();
  }

  requestAnimationFrame(loop);

}

export {
  updateUI, updateTimer,
};
