// @ts-nocheck
// ── Render core: interpolación cliente + game loop ────────────────────
// El bucle de animación que orquesta todo el dibujo (módulos hermanos
// world/entities/hud) más la interpolación del estado recibido. Mantiene
// @ts-nocheck (canvas legacy). Las funciones del motor que necesita (bindings,
// paneles de muerte/game over) se inyectan vía initRender().

import { S } from "../state";
import { canvas, ctx, getMe, worldToScreen } from "./canvas";
import { keys } from "../input";
import { i18nt } from "../../i18n.js";
import { setMissileWarning } from "../../sounds.js";
import { spawnThrustParticle, spawnSmokeParticle, updateParticles, drawStars, drawParticles } from "../../particles.js";
import { CFG_RESPAWN_DELAY } from "../constants";
import { lerp, lerpAngle, extrapolateArr } from "../math";
import { drawWorldBounds, drawGrid, drawpingEffect, drawAsteroids, clearAsteroidCache } from "./world";
import { drawShip, drawVelocityVector, drawBullets, drawBeams, drawEmpPulses, drawMines, drawMissiles, drawFlares } from "./entities";
import { drawWaveHud, drawMineTimers, updateUI, drawRadar, drawWarningOverlay, updateTimer, updateHUD } from "./hud";
import { isSheltered, losBlocked } from "./sensors";

// Re-export para que game.ts mantenga sus imports actuales.
export { clearAsteroidCache, updateUI, updateTimer };

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

    // El panel de muerte (DeadPanel React) se monta siempre que estás muerto: si
    // puedes reaparecer muestra la selección de nave; sin vidas, una vista
    // compacta de espectador. En ambos casos es minimizable para ver la partida
    // (la cámara ya sigue a un aliado vivo = modo espectador).
    setDeadPanelVisible(me.dead);

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

  // ── Self-destruct / suicidio UI (carga: 2s autodestrucción · 1.5s suicidio)
  if (S.sdState === "charging") {
    const suicide = S.sdMode === "suicide";
    const progress = Math.min(1, (Date.now() - S.sdHoldStart) / (suicide ? 1500 : 2000));
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 80;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(cx - 160, cy - 36, 320, 44);
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillStyle = "#ff6666";
    ctx.fillText(i18nt(suicide ? "game.suicideHold" : "game.selfDestructHold", { key: "DEL" }), cx, cy - 16);
    ctx.fillStyle = "#222";
    ctx.fillRect(cx - 130, cy - 4, 260, 8);
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(cx - 130, cy - 4, 260 * progress, 8);
    ctx.restore();
  }

  if (S.sdState === "countdown") {
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
    ctx.font = `bold ${70 + (5 - S.sdCountdown) * 4}px 'Courier New', monospace`;
    ctx.fillText(S.sdCountdown, cx, cy + 12);
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

  // El marcador (Tab mantenido) lo dibuja React (Scoreboard.tsx) con la estética
  // del design system; ya no se pinta en canvas. La visibilidad la controla input
  // (S.showScoreboard) emitiendo el evento "scoreboard" que App escucha.

  requestAnimationFrame(loop);

}
