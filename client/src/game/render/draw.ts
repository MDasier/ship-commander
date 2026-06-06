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
