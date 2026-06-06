// @ts-nocheck
// ── Render de entidades: naves, torretas, proyectiles, minas, bengalas ─
import { S } from "../state";
import { ctx, getMe, worldToScreen } from "./canvas";
import { getShapeDef, buildShipPath, drawShipDetail } from "../shapes";

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

export {
  drawShip, drawVelocityVector, drawBullets, drawBeams,
  drawEmpPulses, drawMines, drawMissiles, drawFlares,
};
