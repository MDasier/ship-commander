// @ts-nocheck
// ── HUD: radar, indicadores, oleadas, temporizador, avisos, panel inferior ─
import { S } from "../state";
import { ctx, canvas, getMe } from "./canvas";
import { i18nt, getLang } from "../../i18n.js";
import { playVoiceAlert } from "../../sounds.js";
import { isSheltered, losBlocked } from "./sensors";

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

// HUD del Interceptor: una ranura de mina por cada slot permitido (S.mineMax =
// CFG.MINE_MAX_ACTIVE del servidor), con un anillo circular que muestra el tiempo
// de vida restante de la mina activa (o vacía si no hay).
function drawMineTimers() {
  const me = getMe();
  if (!me || me.dead || me.shipType !== "interceptor" || me.pilotingFor) return;

  const myMines = S.mines.filter(m => m.ownerId === S.myId);
  const SLOTS = S.mineMax; // = CFG.MINE_MAX_ACTIVE, difundido por el servidor
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

function updateUI() {
  // El botón "Go"/ready vive ahora en React (Room.tsx); guardamos por si el
  // elemento legacy ya no existe.
  const readyBtn = document.getElementById("ready");
  if (readyBtn) readyBtn.disabled = S.uiState !== "inRoom";
}

//RADAR

//RADAR
function drawRadar() {
  const scanning = performance.now() < S.scanUntil;
  const size = 140;

  // Centrado abajo (antes esquina inferior derecha): en ultrawide la esquina
  // queda demasiado lejos de la vista del jugador.
  const x = canvas.width / 2;
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

  // Objetivo fijado: etiqueta centrada justo encima del radar (centro-abajo).
  // Antes iba anclada arriba-izquierda (40,220) y se solapaba con la telemetría
  // de la nave. Misma estética que el retículo sobre la nave (rojo hostil + ⊕).
  if (S.targetId) {
    const t = S.players[S.targetId];
    if (t) {
      const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 220);
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 15px 'Courier New', monospace";
      ctx.fillStyle = `rgba(255,70,70,${pulse})`;
      ctx.fillText(
        "⊕ LOCK: " + (t.name || t.id.slice(0, 6)),
        canvas.width / 2,
        canvas.height - 255
      );
      ctx.restore();
      ctx.textAlign = "left";
    }
  }
}

export {
  drawWaveHud, drawMineTimers, updateUI, drawRadar,
  drawWarningOverlay, updateTimer, updateHUD,
};
