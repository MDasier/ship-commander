const STARS = Array.from({ length: 300 }, () => ({
  x: Math.random() * 6000,
  y: Math.random() * 6000,
  size: Math.random() * 1.6 + 0.2,
  depth: Math.random() * 0.7 + 0.05
}));

const particles = [];

function spawnExplosion(wx, wy, team) {
  const palette = team === "green"
    ? ["#00ff88", "#88ffcc", "#ffffff", "#ffdd44"]
    : ["#ff3355", "#ff8844", "#ffffff", "#ffdd44"];
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 0.5;
    particles.push({
      x: wx, y: wy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: Math.random() * 0.018 + 0.01,
      size: Math.random() * 4 + 1,
      color: palette[Math.floor(Math.random() * palette.length)]
    });
  }
}

// Impacto del rayo de la Capital: chispas eléctricas brillantes y rápidas que se
// proyectan desde el punto de impacto. Efecto propio del rayo (no reutiliza el EMP).
function spawnBeamImpact(wx, wy, team) {
  const hot = team === "green" ? "#aaffdd" : "#ffd0dc";
  const palette = ["#ffffff", "#cfe8ff", hot];
  for (let i = 0; i < 22; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 9 + 2;
    particles.push({
      x: wx, y: wy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: Math.random() * 0.06 + 0.04,   // se apagan rápido (chispa)
      size: Math.random() * 2.2 + 0.6,
      color: palette[Math.floor(Math.random() * palette.length)]
    });
  }
}

function spawnThrustParticle(wx, wy, angle) {
  const spread = (Math.random() - 0.5) * 0.7;
  const backAngle = angle + Math.PI + spread;
  const speed = Math.random() * 2.5 + 0.5;
  particles.push({
    x: wx - Math.cos(angle) * 10,
    y: wy - Math.sin(angle) * 10,
    vx: Math.cos(backAngle) * speed,
    vy: Math.sin(backAngle) * speed,
    life: 1,
    decay: Math.random() * 0.07 + 0.05,
    size: Math.random() * 2 + 0.5,
    color: "#0088ff"
  });
}

// Humo de daño: partícula gris-negra lenta que sube levemente
function spawnSmokeParticle(wx, wy, intensity) {
  const drift = (Math.random() - 0.5) * 0.6;
  const size = Math.random() * 3 + 1.5 + intensity * 3;
  const gray = Math.floor(30 + Math.random() * 40); // 30–70
  particles.push({
    x: wx + (Math.random() - 0.5) * 8,
    y: wy + (Math.random() - 0.5) * 8,
    vx: drift,
    vy: -(Math.random() * 0.5 + 0.1),  // sube lentamente
    life: 1,
    decay: Math.random() * 0.025 + 0.012,
    size,
    color: `rgb(${gray},${gray},${gray})`
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawStars(ctx, camX, camY) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  STARS.forEach(s => {
    const x = ((s.x - camX * s.depth) % w + w) % w;
    const y = ((s.y - camY * s.depth) % h + h) % h;
    const alpha = (s.depth * 0.7 + 0.1).toFixed(2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(x, y, s.size, s.size);
  });
}

function drawParticles(ctx, camX, camY) {
  const hw = ctx.canvas.width / 2;
  const hh = ctx.canvas.height / 2;
  ctx.save();
  particles.forEach(p => {
    const sx = p.x - camX + hw;
    const sy = p.y - camY + hh;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// ── Superficie pública del módulo (consumida por game.js como ES module) ──
export {
  spawnExplosion, spawnBeamImpact, spawnThrustParticle, spawnSmokeParticle,
  updateParticles, drawStars, drawParticles,
};
