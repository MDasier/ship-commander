// @ts-nocheck
// Migración incremental a TS (Fase B). Este fichero (entry+fachada, ~3.4k líneas)
// se renombró .js→.ts para que los importadores resuelvan y para poder extraer
// módulos TIPADOS (que SÍ se chequean) a game/*. El repo usa TypeScript 6 con
// strict ON por defecto: tipar el cuerpo entero de golpe es inviable sin riesgo
// de regresión, así que se mantiene sin chequear igual que la estrategia
// checkJs:false del resto de JS legacy. Quitar este pragma a medida que su
// contenido migre a módulos tipados (net.ts, input.ts, render/, …).
// ── Módulos del cliente (ES modules · empaquetados por Vite) ──
import "./styles.css";
import { i18nt, applyI18n, onLangChange, setLang, getLang } from "./i18n.js";
import {
  spawnExplosion, spawnBeamImpact, spawnThrustParticle, spawnSmokeParticle,
  updateParticles, drawStars, drawParticles,
} from "./particles.js";
import {
  initAudio, startMusic, stopMusic,
  setMissileWarning, resetAudio,
  playShootSound, playBeamReadySound, playAbilityReadySound, playEmpSound,
  playBeamFireSound, playExplosionSound, playMissileSound, playVictorySound,
  playSelfDestructBeep, playAlertSound, playVoiceAlert, playPingSound,
} from "./sounds.js";
import {
  getShapeDef, buildShipPath, drawShipDetail, drawShipPreview,
} from "./game/shapes";
import {
  DEFAULT_BINDINGS, BINDING_LABELS, RESERVED_KEYS,
  SUPPORT_URL, MENU_SCREENS, REACT_SCREENS, CFG_RESPAWN_DELAY,
} from "./game/constants";
import {
  applyStoredVolumes, getAudioSettings,
  setAudioEffects, setAudioMusic, setAudioTrack, setAudioMuted,
} from "./game/audio";
import {
  lerp, lerpAngle, extrapolateArr, seededRand, ptSegDist,
} from "./game/math";

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// ── Keybindings ────────────────────────────────
let bindings = { ...DEFAULT_BINDINGS };
try {
  const saved = JSON.parse(localStorage.getItem("spacetactics_bindings") || "null");
  if (saved) bindings = { ...DEFAULT_BINDINGS, ...saved };
} catch (_) { }

function saveBindings() {
  localStorage.setItem("spacetactics_bindings", JSON.stringify(bindings));
}

function displayKey(k) {
  if (!k) return "—";
  const map = { " ": "Espacio", "arrowleft": "←", "arrowright": "→", "arrowup": "↑", "arrowdown": "↓" };
  return map[k] || k.toUpperCase();
}

let recordingAction = null;
let recordingHandler = null;

function cancelRecording() {
  if (recordingHandler) {
    document.removeEventListener("keydown", recordingHandler, true);
    recordingHandler = null;
  }
  recordingAction = null;
}

function startRecording(action, keyEl) {
  cancelRecording();
  recordingAction = action;
  keyEl.innerHTML = `<kbd class="bindingRecording">Presiona...</kbd>`;

  recordingHandler = function (e) {
    if (["shift", "control", "alt", "meta"].includes(e.key.toLowerCase())) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    const newKey = e.key.toLowerCase();

    if (RESERVED_KEYS.has(newKey)) {
      keyEl.innerHTML = `<kbd class="bindingError">Reservada</kbd>`;
      setTimeout(() => {
        keyEl.innerHTML = `<kbd>${displayKey(bindings[action])}</kbd>`;
      }, 1200);
      cancelRecording();
      return;
    }

    // Desvincula la tecla si ya estaba asignada a otra acción
    for (const [k, v] of Object.entries(bindings)) {
      if (k !== action && v === newKey) {
        bindings[k] = null;
        const otherEl = document.querySelector(`.bindingKeyCell[data-action="${k}"]`);
        if (otherEl) otherEl.innerHTML = `<kbd>—</kbd>`;
      }
    }

    bindings[action] = newKey;
    saveBindings();
    keyEl.innerHTML = `<kbd>${displayKey(newKey)}</kbd>`;
    cancelRecording();
  };

  document.addEventListener("keydown", recordingHandler, true);
}

// ── Puente para la UI React (Fase 1) ──────────────────────────────────
// `bindings` sigue siendo la única fuente de verdad que consume el input del
// juego. React lee/escribe a través de esta API; la captura de tecla la hace
// el componente React y llama rebindKey(). El render legacy (mobiglass) sigue
// usando bindings directamente y se mantiene coherente al leer getBindings().
const _bindingsListeners = [];
function onBindingsChange(fn) {
  _bindingsListeners.push(fn);
  return () => {
    const i = _bindingsListeners.indexOf(fn);
    if (i >= 0) _bindingsListeners.splice(i, 1);
  };
}
function _emitBindingsChange() {
  const snap = getBindings();
  _bindingsListeners.forEach(fn => { try { fn(snap); } catch (_) { } });
}
function getBindings() { return { ...bindings }; }
// Reasigna `rawKey` a `action`. Devuelve "ok" | "reserved". Misma lógica que
// startRecording pero sin DOM (normaliza, rechaza reservadas, desvincula
// conflictos, persiste y notifica a React).
function rebindKey(action, rawKey) {
  const newKey = (rawKey || "").toLowerCase();
  if (RESERVED_KEYS.has(newKey)) return "reserved";
  for (const [k, v] of Object.entries(bindings)) {
    if (k !== action && v === newKey) bindings[k] = null;
  }
  bindings[action] = newKey;
  saveBindings();
  _emitBindingsChange();
  return "ok";
}
function resetBindings() {
  bindings = { ...DEFAULT_BINDINGS };
  saveBindings();
  _emitBindingsChange();
}

function renderControlesPane(targetId = "pane-controles") {
  cancelRecording();
  const pane = document.getElementById(targetId);
  if (!pane) return;
  pane.innerHTML = "";

  const table = document.createElement("table");
  table.className = "mobiControls bindingTable";

  for (const [action, label] of Object.entries(BINDING_LABELS)) {
    const tr = document.createElement("tr");

    const tdLabel = document.createElement("td");
    tdLabel.textContent = i18nt("controls." + action) !== ("controls." + action)
      ? i18nt("controls." + action) : label;

    const tdKey = document.createElement("td");
    tdKey.className = "bindingKeyCell";
    tdKey.dataset.action = action;
    tdKey.innerHTML = `<kbd>${displayKey(bindings[action])}</kbd>`;

    const tdBtn = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "bindingChangeBtn";
    btn.textContent = i18nt("controls.change");
    btn.onclick = () => {
      startRecording(action, tdKey);
    };
    tdBtn.appendChild(btn);

    tr.appendChild(tdLabel);
    tr.appendChild(tdKey);
    tr.appendChild(tdBtn);
    table.appendChild(tr);
  }

  const resetBtn = document.createElement("button");
  resetBtn.className = "bindingChangeBtn";
  resetBtn.style.marginTop = "14px";
  resetBtn.textContent = i18nt("controls.reset");
  resetBtn.onclick = () => {
    bindings = { ...DEFAULT_BINDINGS };
    saveBindings();
    renderControlesPane(targetId);
  };

  const fixedDiv = document.createElement("div");
  fixedDiv.innerHTML = `
    <div class="bindingFixedTitle">${i18nt("controls.fixed")}</div>
    <table class="mobiControls" style="color:#3a5060">
      <tr><td><kbd>${i18nt("controls.kbMouse")}</kbd></td><td>${i18nt("controls.fxAim")}</td></tr>
      <tr><td><kbd>${i18nt("controls.kbLClick")}</kbd></td><td>${i18nt("controls.fxFire")}</td></tr>
      <tr><td><kbd>${i18nt("controls.kbRClick")}</kbd></td><td>${i18nt("controls.fxLock")}</td></tr>
      <tr><td><kbd>${i18nt("controls.kbTab")}</kbd></td><td>${i18nt("controls.fxScore")}</td></tr>
      <tr><td><kbd>F1</kbd></td><td>${i18nt("controls.fxMobi")}</td></tr>
      <tr><td><kbd>Del</kbd></td><td>${i18nt("controls.fxSelfDestruct")}</td></tr>
    </table>
  `;

  pane.appendChild(table);
  pane.appendChild(resetBtn);
  pane.appendChild(fixedDiv);
}


const pingEffect = [];
function triggerPingEffect(x, y) {
  pingEffect.push({
    x,
    y,
    start: performance.now(),
    duration: 1200
  });
}


canvas.width = innerWidth;
canvas.height = innerHeight;

addEventListener("resize", () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
});

const _wsProto = location.protocol === "https:" ? "wss:" : "ws:";
const _wsHost = location.hostname ? location.host : "localhost:8080";
// El juego usa el path "/ws" para no colisionar con el WebSocket de HMR del dev
// server de Vite (que también usa la raíz). El servidor escucha en ese mismo path.
const _wsURL = _wsProto + "//" + _wsHost + "/ws";
const ws = new WebSocket(_wsURL);

// ── Feedback de pérdida de conexión + reconexión automática ──
// El estado del jugador vive en el servidor atado a la conexión; al reconectar se
// recarga la página para empezar una sesión limpia y coherente.
let _connLost = false;
let _reconnectTimer = null;
let _reconnectProbe = null;

// ── Arranque en frío del servidor (anti-standby) ──
// Mientras no se haya conectado nunca, mostramos la pantalla de "despertando";
// si tarda, escalamos al mensaje de reposo. Tras la primera conexión, una caída
// pasa a usar el overlay normal de "conexión perdida".
let _everConnected = false;
function hideBoot() {
  const b = document.getElementById("serverBoot");
  if (b) b.classList.add("hidden");
}
function showBoot(cold) {
  const b = document.getElementById("serverBoot");
  if (b) b.classList.remove("hidden");
  if (cold) {
    const c = document.getElementById("serverBootCold");
    if (c) c.classList.remove("hidden");
  }
}
// Si en 4 s no hemos conectado, probablemente el servidor estaba dormido
setTimeout(() => { if (!_everConnected) showBoot(true); }, 4000);
ws.addEventListener("open", () => { _everConnected = true; hideBoot(); });

function showConnLost() {
  // Aún no habíamos conectado nunca → es un arranque en frío, no una caída
  if (!_everConnected) {
    showBoot(true);
    scheduleReconnect(1500);
    return;
  }
  if (_connLost) return;
  _connLost = true;
  // El overlay de conexión perdida está migrado a React (App.tsx → Reconnect);
  // game.js sigue conduciendo la reconexión automática (sonda WS + recarga).
  window.dispatchEvent(new CustomEvent("conn-lost"));
  scheduleReconnect(500);
}

function scheduleReconnect(delay) {
  clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(tryReconnect, delay);
}

function tryReconnect() {
  // Cierra cualquier sonda previa
  if (_reconnectProbe) { try { _reconnectProbe.onopen = _reconnectProbe.onerror = null; _reconnectProbe.close(); } catch (e) { } }
  try {
    _reconnectProbe = new WebSocket(_wsURL);
  } catch (e) {
    scheduleReconnect(2000);
    return;
  }
  _reconnectProbe.onopen = () => {
    // Servidor disponible de nuevo → recargar para reiniciar la sesión limpiamente
    try { _reconnectProbe.close(); } catch (e) { }
    location.reload();
  };
  _reconnectProbe.onerror = () => {
    try { _reconnectProbe.close(); } catch (e) { }
    scheduleReconnect(2000); // reintenta cada 2 s mientras el servidor no responda
  };
}

ws.addEventListener("close", showConnLost);
ws.addEventListener("error", showConnLost);

let uiState = "lobby";
let currentRoomId = null;
let gameOverTimer = null;

let myId = null;
let roomData = null;

let players = {};
let bullets = [];
let beams = [];
let empPulses = [];
let mines = [];
let prevPulseIds = new Set();   // para sonar el EMP/explosión solo en pulsos nuevos
let prevBeamIds = new Set();    // para lanzar el burst de impacto del rayo solo una vez

// ── Modo oleadas (solo práctica) ──
let soloMode = false;
let waveMode = false;
let teamLives = null;   // vidas compartidas del equipo en modo oleadas (null = respawn infinito)
let waveNum = 0;
let waveTotal = 0;
let enemiesLeft = 0;
let waveBanner = null;       // { key, n } enviado por el servidor
let waveBannerSig = null;
let waveBannerShownAt = 0;
let asteroids = [];

let targetId = null;
let missiles = [];
let flares = [];
let scanUntil = 0;
let pingEnemiesUntil = 0;
let nextPingAt = 0;          // cooldown del ping de radar (1 cada 3 s)
const PING_COOLDOWN_MS = 3000;
let inertiaDampActive = true;

let world = {
  width: 10000,
  height: 10000
};

let winner = null;
let prevWinner = null;

// ── Client-side interpolation ──────────────────
const INTERP_DELAY = 80;  // ms behind server time (~2.5 ticks at 30fps)
const MAX_BUFFER = 12;
let stateBuffer = [];  // [{time, players, bullets, missiles, flares}]


function applyInterpolatedState() {
  if (stateBuffer.length === 0) return;

  const renderTime = Date.now() - INTERP_DELAY;

  // Find the two states that bracket renderTime
  let idx = 0;
  while (idx < stateBuffer.length - 1 && stateBuffer[idx + 1].time <= renderTime) idx++;

  const s0 = stateBuffer[idx];
  const s1 = stateBuffer[idx + 1];

  // Ticks elapsed since the latest state we have (for bullet/missile extrapolation)
  const latest = s1 || s0;
  const ticksSince = Math.max(0, (Date.now() - latest.time) / (1000 / 30));

  if (!s1) {
    // Only one state available — use it directly, extrapolate projectiles
    players = s0.players;
    bullets = extrapolateArr(s0.bullets, ticksSince);
    missiles = extrapolateArr(s0.missiles, ticksSince);
    flares = s0.flares;
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
  players = interped;
  bullets = extrapolateArr(s1.bullets, ticksSince);
  missiles = extrapolateArr(s1.missiles, ticksSince);
  flares = s1.flares;

  // Trim buffer — keep only the last MAX_BUFFER entries
  if (stateBuffer.length > MAX_BUFFER) stateBuffer.splice(0, stateBuffer.length - MAX_BUFFER);
}
let deadIds = new Set();

let specTargetId = null;
let killFeed = [];
let chatLog = [];
let shakeMag = 0;
let clientDeadAt = null;
let showScoreboard = false;

let mouseX = 0;
let mouseY = 0;

const keys = {};

// Suelta todas las teclas a la vez (evita inputs "atascados" al perder el foco,
// alt-tab, abrir el chat o un panel). El movimiento se lee de este estado.
function clearKeys() {
  for (const k in keys) keys[k] = false;
}
// Si la ventana pierde el foco o se oculta la pestaña, soltamos todo.
addEventListener("blur", clearKeys);
document.addEventListener("visibilitychange", () => { if (document.hidden) clearKeys(); });

const menu = document.getElementById("menu");

// El HUD vive en React (Hud.tsx), montado en la ruta /game. Sustituimos el
// antiguo flag visual (#hud.hidden) por un estado de juego explícito que los
// guards de input consultan; React monta/desmonta el HUD por ruta.
let inGame = false;

// ── Mobiglass
// Pestañas, botón de cierre y click-fuera del MobiGlass los gestiona React
// (MobiGlass.tsx). game.js solo emite el evento "mobi" en open/closeMobiglass.
let mobiOpen = false;

function bindingText(action) {
  return displayKey(bindings[action] || DEFAULT_BINDINGS[action]);
}

// ── i18n: aplica el idioma guardado al cargar y cablea los selectores ──
(function initI18n() {
  if (typeof applyI18n !== "function") return;   // i18n.js no cargado
  applyI18n();
  document.querySelectorAll("[data-lang]").forEach(b =>
    b.addEventListener("click", () => setLang(b.getAttribute("data-lang"))));
  onLangChange(() => {
    // Re-render de la UI dinámica que no usa data-i18n
    try { renderControlesPane(); } catch (e) { }
    try { renderControlesPane("menuControlsBody"); } catch (e) { }
    try { if (typeof buildShipCards === "function") buildShipCards(); } catch (e) { }
  });
})();

// MobiGlass migrado a React (MobiGlass.tsx). open/close solo gestionan el flag
// mobiOpen (consultado por F1 y el cierre en game over) y avisan a React por
// evento; el render del overlay lo hace el componente.
function openMobiglass() {
  const me = getMe();
  if (!me) return;
  mobiOpen = true;
  window.dispatchEvent(new CustomEvent("mobi", { detail: true }));
}
function closeMobiglass() {
  cancelRecording();
  mobiOpen = false;
  window.dispatchEvent(new CustomEvent("mobi", { detail: false }));
}
// Estado de jugadores (puente para React: paneles Piloto/Partida del MobiGlass).
function getPlayers() { return players; }


// ── Game Over
// Game Over migrado a React (GameOver.tsx): el texto VICTORIA/DERROTA + marcador
// se siguen dibujando en el canvas; React solo monta las pistas host/invitado y
// los botones (reiniciar / volver al lobby), vía el evento "gameover".
function showGameOver() {
  if (uiState !== "inRoom") return;
  if (!winner) return;
  const isHost = !!(roomData && roomData.ownerId === myId);
  playVictorySound();
  stopMusic();
  hideDeadPanel();
  window.dispatchEvent(new CustomEvent("gameover", { detail: { show: true, isHost, solo: soloMode } }));
}

function hideGameOver() {
  window.dispatchEvent(new CustomEvent("gameover", { detail: { show: false } }));
}

// Acción de reinicio (host) desde el game over React.
function gameRestart() { ws.send(JSON.stringify({ type: "restartGame" })); }

function resetClientState() {
  players = {}; bullets = []; missiles = []; asteroids = [];
  flares = []; winner = null; prevWinner = null; targetId = null;
  stateBuffer = [];
  specTargetId = null; deadIds = new Set(); killFeed = []; chatLog = [];
  shakeMag = 0;
  asteroidCache.clear();
  cancelSd();
  hideDeadPanel();
  soloMode = false; waveMode = false; waveNum = 0; enemiesLeft = 0; waveBanner = null; teamLives = null;
}

// Vuelve al lobby desde cualquier estado (game over, partida en curso o muerto).
// Centraliza toda la limpieza para que no haya estados a medias ("doble salida").
function returnToLobby() {
  clearTimeout(gameOverTimer);
  gameOverTimer = null;
  winner = null;
  prevWinner = null;

  ws.send(JSON.stringify({ type: "leaveRoom" }));
  resetClientState();          // limpia winner/prevWinner, players, target, etc.
  uiState = "lobby";
  currentRoomId = null;
  roomData = null;

  resetAudio();
  hideGameOver();
  hideDeadPanel();
  closeMobiglass();
  closeChat();
  menu.style.display = "";
  inGame = false;
  showMenuScreen("mainMenu");   // volver al hub principal
  updateUI();
}

// ── Chat ── migrado a React (ChatInput.tsx): el LOG se dibuja en el canvas;
// React solo monta el input al abrir. chatInputOpen sigue aquí (puerta del input
// de juego). openChat/closeChat emiten "chat"; chatSend envía y cierra.
let chatInputOpen = false;

function openChat() {
  chatInputOpen = true;
  clearKeys();   // suelta el movimiento al empezar a escribir
  window.dispatchEvent(new CustomEvent("chat", { detail: true }));
}

function closeChat() {
  chatInputOpen = false;
  window.dispatchEvent(new CustomEvent("chat", { detail: false }));
}

function chatSend(text) {
  const t = (text || "").trim();
  if (t) ws.send(JSON.stringify({ type: "chat", text: t }));
  closeChat();
}

canvas.addEventListener("mousemove", e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

document.addEventListener("contextmenu", e => e.preventDefault());

// ── Weapon heat system
let weaponHeat = 0;
let mouseLeftHeld = false;
let weaponFireTimer = null;

// Estados para avisos de voz por flanco (se disparan una vez al cruzar el umbral)
let _voiceFuelLow = false;
let _voiceShieldDown = false;

const HEAT_PER_SHOT = 10;//calor por bala
const HEAT_DECAY_MS = 46;//milisegundos de enfriamiento
const HEAT_DECAY_AMT = 1;//calor que baja por tick
const BASE_FIRE_MS = 100;//cadencia

let weaponOverheated = false;
const OVERHEAT_LIMIT = 99;//calor máximo (umbral de bloqueo)
const RECOVER_LIMIT = 60;//calor mínimo (umbral de descongestión)

// ── FIRE LOOP
function fireWeapon() {
  const me = getMe();

  if (!me || me.dead || !inGame) {
    stopAutoFire();
    return;
  }

  if (weaponOverheated) {
    playAlertSound("weaponLocked");   // intento de disparo con el arma bloqueada
    stopAutoFire();
    return;
  }

  ws.send(JSON.stringify({ type: "shoot" }));
  playShootSound();

  weaponHeat = Math.min(100, weaponHeat + HEAT_PER_SHOT);

  if (weaponHeat >= OVERHEAT_LIMIT) {
    weaponOverheated = true;
    playAlertSound("weaponLocked");   // el arma acaba de sobrecalentarse
    stopAutoFire();
    return;
  }

  // SOLO depende del input real
  if (!mouseLeftHeld) {
    clearTimeout(weaponFireTimer);
    weaponFireTimer = null;
    return;
  }

  const heatFactor = weaponHeat / 100;

  const interval = BASE_FIRE_MS *
    (1 + Math.pow(heatFactor, 2) * 4);

  weaponFireTimer = setTimeout(fireWeapon, interval);
}
function startAutoFire() {
  mouseLeftHeld = true;

  // evita duplicar loops
  if (weaponFireTimer) return;

  fireWeapon();
}
function stopAutoFire() {
  mouseLeftHeld = false;

  clearTimeout(weaponFireTimer);
  weaponFireTimer = null;
}
//enfriamiento de arma
setInterval(() => {
  if (weaponHeat > 0) {
    weaponHeat = Math.max(0, weaponHeat - HEAT_DECAY_AMT);

    if (weaponOverheated && weaponHeat <= RECOVER_LIMIT) {
      weaponOverheated = false;
    }
  }
}, HEAT_DECAY_MS);


// ── Rayo de la Capital: mantener pulsado para cargar, soltar para disparar
let beamHeld = false;
function isCapitalPilot() {
  const me = getMe();
  return !!(me && !me.dead && me.shipType === "capital" && !me.pilotingFor);
}
function startBeamCharge() {
  if (beamHeld) return;            // ignora repetición de tecla
  beamHeld = true;
  ws.send(JSON.stringify({ type: "beamCharge", charging: true }));
}
// cancel=true → soltar sin disparar (mouseleave, perder foco, muerte). Evita que
// el rayo se dispare por un release involuntario aunque estuviera cargado.
function releaseBeamCharge(cancel = false) {
  if (!beamHeld) return;
  beamHeld = false;
  const me = getMe();
  if (!cancel && me && (me.beamCharge ?? 0) >= 0.999) playBeamFireSound();  // solo si llegó a disparar
  ws.send(JSON.stringify({ type: "beamCharge", charging: false, cancel }));
}
let beamWasReady = false;     // para sonar el aviso eléctrico al quedar listo el rayo
let abilityWasReady = true;   // idem para la habilidad [X] (arranca lista → sin aviso inicial)

// Enfriamiento pasivo de arma
//setInterval(() => {
//  if (weaponHeat > 0) weaponHeat = Math.max(0, weaponHeat - HEAT_DECAY_AMT);
//}, HEAT_DECAY_MS);

canvas.addEventListener("mousedown", e => {
  if (!inGame) return;
  const me = getMe();
  if (!me || me.dead) return;
  if (e.button === 0) {
    if (isCapitalPilot()) { startBeamCharge(); return; }
    stopAutoFire();
    mouseLeftHeld = true;
    fireWeapon();
  } else if (e.button === 2) {
    // Clic der: ciclar objetivo; al pasar del último → deslockear
    cycleTargetByRadar();
  }
});

canvas.addEventListener("mouseup", e => {
  if (e.button === 0) { releaseBeamCharge(); stopAutoFire(); }
});

// El ratón sale del canvas: cancelar la carga (no disparar) para no soltar el rayo sin querer
canvas.addEventListener("mouseleave", () => { releaseBeamCharge(true); stopAutoFire(); });

// Perder el foco de la ventana (alt-tab, clic fuera): cancelar la carga del rayo
addEventListener("blur", () => { releaseBeamCharge(true); stopAutoFire(); });

// ── Spectator
function cycleSpectator() {
  const living = Object.values(players).filter(p => !p.dead && p.id !== myId);
  if (living.length === 0) { specTargetId = null; return; }
  if (!specTargetId) { specTargetId = living[0].id; return; }
  const idx = living.findIndex(p => p.id === specTargetId);
  specTargetId = living[(idx + 1) % living.length].id;
}

// ── Self-destruct
let sdState = null;  // null | "charging" | "countdown"
let sdHoldTimer = null;
let sdInterval = null;
let sdCountdown = 0;
let sdHoldStart = 0;

function startSdCharge() {
  const me = getMe();
  if (!me || me.dead || sdState) return;
  sdState = "charging";
  sdHoldStart = Date.now();
  sdHoldTimer = setTimeout(startSdCountdown, 2000);
}

function startSdCountdown() {
  sdState = "countdown";
  sdCountdown = 5;
  playSelfDestructBeep(5);
  sdInterval = setInterval(() => {
    sdCountdown--;
    if (sdCountdown > 0) {
      playSelfDestructBeep(sdCountdown);
    } else {
      clearInterval(sdInterval);
      sdInterval = null;
      sdState = null;
      ws.send(JSON.stringify({ type: "selfDestruct" }));
    }
  }, 1000);
}

function cancelSd() {
  clearTimeout(sdHoldTimer);
  clearInterval(sdInterval);
  sdState = null;
  sdHoldTimer = null;
  sdInterval = null;
  sdCountdown = 0;
}

// ── Nombre del jugador ──────────────────────────────────────────────
// Migrado a React (MainMenu): game.js ya no depende del DOM #nameInput.
// El nombre vive en `playerName` + localStorage y se sincroniza vía GameAPI.
let playerName = (localStorage.getItem("spacetactics_name") || "").trim();

function applyName(name) {
  if (name != null) playerName = String(name).trim();
  if (!playerName) playerName = "Pilot";
  localStorage.setItem("spacetactics_name", playerName);
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "setName", name: playerName }));
  }
  return playerName;
}

// Valida que haya un nombre escrito (el menú React lo exige antes de COOP).
function requireName() {
  if (!playerName.trim()) return false;
  applyName();
  return true;
}

// Getters/setters para la UI React.
function getPlayerName() { return playerName; }
function setPlayerName(name) { return applyName(name); }

// Acciones de la lista de salas (disparadas desde React, CoopRooms.tsx).
function lobbyCreateRoom() {
  if (!requireName()) return;
  initAudio();
  applyStoredVolumes();
  ws.send(JSON.stringify({ type: "createRoom" }));
}
function lobbyRefresh() {
  ws.send(JSON.stringify({ type: "getRooms" }));
}
function lobbyJoin(roomId) {
  if (!requireName()) return;
  initAudio();
  applyStoredVolumes();
  ws.send(JSON.stringify({ type: "joinRoom", roomId }));
}

// ── Acciones de la sala (disparadas desde React, Room.tsx) ──
function roomSend(msg) { ws.send(JSON.stringify(msg)); }
function getRoomData() { return roomData; }
function getMyId() { return myId; }
function roomToggleReady() { if (uiState === "inRoom") roomSend({ type: "ready" }); }
function roomSwitchTeam() { roomSend({ type: "switchTeam" }); }
function roomLeave() { returnToLobby(); }

// ── Navegación del menú principal ──────────────
let _menuScreen = "mainMenu";
function showMenuScreen(name) {
  _menuScreen = name;
  MENU_SCREENS.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle("hidden", s !== name);
  });
  // Pantallas ya migradas a React (overlays montados por App.tsx). Ocultamos el
  // contenedor legacy #menu cuando la activa es una de ellas para que su chrome
  // antiguo no se vea de fondo. El resto (lobby/room, aún legacy) lo mantiene.
  const menuEl = document.getElementById("menu");
  if (menuEl) menuEl.style.display = REACT_SCREENS.has(name) ? "none" : "";
  // Notifica a React la pantalla activa (para reflejarla en la ruta).
  window.dispatchEvent(new CustomEvent("menu-screen", { detail: name }));
}
function getMenuScreen() { return _menuScreen; }

// Acciones del menú principal, disparadas desde React (MainMenu.tsx).
// COOP: exige nombre, abre el lobby legacy y pide la lista de salas.
function menuPlayOnline() {
  if (!requireName()) return false;
  showMenuScreen("lobby");
  ws.send(JSON.stringify({ type: "getRooms" }));
  return true;
}
function menuSolo() { showMenuScreen("soloSetup"); }
function menuMain() { showMenuScreen("mainMenu"); }

document.querySelectorAll("[data-back]").forEach(btn => {
  btn.onclick = () => showMenuScreen("mainMenu");
});

// Arrancamos en el MainMenu React (ruta "/"): ocultamos el chrome legacy de #menu.
showMenuScreen("mainMenu");

// La pantalla de práctica solo está migrada a React (FlySolo.tsx). Arranca la
// partida con las opciones elegidas; conserva el flujo legacy (guardar nombre,
// inicializar audio) antes de pedir el solo al servidor.
function startSolo({ mode = "waves", size = "large", durationS = 300, shipType = "fighter" } = {}) {
  applyName();                       // guarda el tag actual (sin exigirlo en solo)
  initAudio();
  applyStoredVolumes();
  ws.send(JSON.stringify({ type: "startSolo", mode, size, durationS, shipType }));
}

ws.onmessage = e => {

  const data = JSON.parse(e.data);

  if (data.type === "init") {
    myId = data.id;
    if (data.ships) buildShipCards(data.ships);
    applyName();
  }

  if (data.type === "rooms") {
    renderRooms(data.rooms);
  }

  if (data.type === "roomJoined") {

    currentRoomId = data.roomId;
    uiState = "inRoom";

    showMenuScreen("room");
    updateUI();
  }

  if (data.type === "roomUpdate") {
    roomData = data.room;
    renderPlayers();
  }

  if (data.type === "balanceError") {
    // La sala vive en React (Room.tsx): le pasamos el aviso de desequilibrio.
    window.dispatchEvent(new CustomEvent("room-error", { detail: { green: data.green, red: data.red } }));
  }

  if (data.type === "gameStarted") {

    menu.style.display = "none";
    inGame = true;
    // Desmonta cualquier overlay de menú React (p. ej. FlySolo) al entrar en juego.
    window.dispatchEvent(new CustomEvent("menu-screen", { detail: "game" }));
    deadIds = new Set();
    startMusic();

  }

  if (data.type === "chat") {
    chatLog.push({ name: data.name, team: data.team, text: data.text, ts: Date.now() });
    if (chatLog.length > 8) chatLog.shift();
  }

  if (data.type === "roomRestarted") {

    clearTimeout(gameOverTimer);
    gameOverTimer = null;
    winner = null;
    prevWinner = null;

    resetClientState();
    roomData = data.room;
    uiState = "inRoom";
    currentRoomId = data.room.id;
    hideGameOver();
    closeMobiglass();
    inGame = false;
    menu.style.display = "";
    showMenuScreen("room");
    renderPlayers();
    resetAudio();
    updateUI();
  }

  if (data.type === "state") {
    // Ignorar estados tardíos que llegan tras salir de la sala: el servidor sigue
    // emitiendo a 60fps hasta procesar el leaveRoom y esos frames re-asignaban
    // `winner`, reprogramando el game over (bug de "doble salida" al lobby).
    if (uiState !== "inRoom") return;

    const incoming = data.players || {};

    // Detect newly dead → explosion + shake
    Object.values(incoming).forEach(p => {
      if (p.dead && !deadIds.has(p.id)) {
        deadIds.add(p.id);
        // Artillero dentro de una nave: no generar explosión separada (ya la genera el piloto)
        if (!p.pilotingFor) {
          spawnExplosion(p.x, p.y, p.team);
          playExplosionSound();
          const myP = players[myId];
          if (myP) {
            const dist = Math.hypot(p.x - myP.x, p.y - myP.y);
            shakeMag = Math.max(shakeMag, Math.max(0, (500 - dist) / 500) * 14);
          }
        }
        if (p.id === myId) { cancelSd(); clientDeadAt = Date.now(); targetId = null; }
      }
      // Detectar respawn (dead → alive)
      if (!p.dead && deadIds.has(p.id)) {
        deadIds.delete(p.id);
        if (p.id === myId) { clientDeadAt = null; hideDeadPanel(); }
      }
    });

    // Mostrar/ocultar panel de nave al morir
    const myIncoming = incoming[myId];
    const myWasDead = players[myId]?.dead;
    if (myIncoming && myIncoming.dead && !myWasDead) showDeadPanel();
    if (myIncoming && !myIncoming.dead && myWasDead) hideDeadPanel();

    // Detect damage taken → shake
    const myPrev = players[myId];
    const myNext = incoming[myId];
    if (myPrev && myNext && myNext.hp < myPrev.hp && myNext.hp > 0) {
      shakeMag = Math.max(shakeMag, (myPrev.hp - myNext.hp) * 0.45);
    }

    // Push to interpolation buffer — positions are applied each RAF frame
    stateBuffer.push({
      time: Date.now(),
      players: incoming,
      bullets: data.bullets || [],
      missiles: data.missiles || [],
      flares: data.flare || [],
    });

    // Non-interpolated state: apply immediately
    beams = data.beams || [];
    // Burst de impacto (partículas) solo al aparecer un beam nuevo que ha golpeado
    const seenBeams = new Set();
    beams.forEach(b => {
      seenBeams.add(b.id);
      if (b.hit && !prevBeamIds.has(b.id)) spawnBeamImpact(b.x2, b.y2, b.team);
    });
    prevBeamIds = seenBeams;
    empPulses = data.empPulses || [];
    mines = data.mines || [];
    // Sonido al aparecer una onda EMP / explosión de mina nueva
    const seen = new Set();
    empPulses.forEach(e => {
      seen.add(e.id);
      if (!prevPulseIds.has(e.id)) {
        if (e.blast) playExplosionSound(); else playEmpSound();
      }
    });
    prevPulseIds = seen;
    asteroids = data.asteroids || [];
    world = data.world || world;
    winner = data.winner;
    killFeed = data.killFeed || [];
    updateTimer(data.timeLeft);

    // Modo oleadas (solo práctica)
    soloMode = !!data.solo;
    waveMode = !!data.waveMode;
    teamLives = (data.teamLives === undefined ? null : data.teamLives);
    waveNum = data.wave || 0;
    waveTotal = data.waveTotal || 0;
    enemiesLeft = data.enemiesLeft || 0;
    if (data.waveBanner) {
      const sig = data.waveBanner.key + "|" + data.waveBanner.n;
      if (sig !== waveBannerSig) {
        waveBanner = data.waveBanner;       // { key, n }
        waveBannerSig = sig;
        waveBannerShownAt = Date.now();
      }
    } else {
      waveBanner = null;
      waveBannerSig = null;
    }
  }

};

// La lista de salas está migrada a React (CoopRooms.tsx). Guardamos el último
// listado del servidor y avisamos a React; el render lo hace el componente.
let roomList = [];
function getRoomList() { return roomList; }
function renderRooms(list) {
  roomList = Array.isArray(list) ? list : [];
  window.dispatchEvent(new CustomEvent("rooms-update"));
}
// Etiquetas cortas para la lista de jugadores — se actualizan dinámicamente
const SHIP_LABELS = { interceptor: "INTERCEPTOR", fighter: "L.FIGHTER", bomber: "BOMBER", gunship: "GUNSHIP" };

// Metadatos de nave que envía el servidor en el init. Se exponen a React
// (getShips + evento "ships-init") para que las pantallas React (Vuela Solo,
// y más adelante Lobby) rendericen sus tarjetas con los stats reales.
let shipMeta = null;
function getShips() { return shipMeta; }

function buildShipCards(ships) {
  shipMeta = ships;
  window.dispatchEvent(new CustomEvent("ships-init"));
  for (const [type, ship] of Object.entries(ships)) {
    const words = (ship.label || type).split(" ");
    SHIP_LABELS[type] = words[words.length - 1].toUpperCase().slice(0, 7);
  }

  const vals = Object.values(ships);
  const maxHp = Math.max(...vals.map(s => s.maxHp));
  const maxSpeed = Math.max(...vals.map(s => s.thrustMult));
  const maxMsl = Math.max(...vals.map(s => s.maxMissiles));
  const maxRadar = Math.max(...vals.map(s => s.radarSignature));
  const maxShield = Math.max(...vals.map(s => s.maxShield ?? 0));

  function segs(value, max, invert = false, n = 10) {
    const filled = Math.round((value / max) * n);
    const active = invert ? n - filled : filled;
    return Array.from({ length: n }, (_, i) =>
      `<i class="ss ${i < active ? 'a' : ''}"></i>`
    ).join('');
  }

  function makeCard(type, ship, previewIdPrefix) {
    const btn = document.createElement("button");
    btn.className = "shipCard" + (type === "fighter" ? " selected" : "");
    btn.dataset.type = type;
    const mslDisplay = ship.crewCapacity > 1 ? `${ship.maxMissiles}+20` : ship.maxMissiles;
    const velDisplay = Math.round(ship.thrustMult * 100) + "%";
    btn.innerHTML = `
      <canvas class="shipPreview" id="${previewIdPrefix}${type}" width="90" height="54"></canvas>
      <div class="shipCardName">${ship.label || type.toUpperCase()}</div>
      <div class="shipStats">
        <div class="sRow"><span class="sLbl">HP</span><div class="sBar">${segs(ship.maxHp, maxHp)}</div><span class="sVal">${ship.maxHp}</span></div>
        <div class="sRow sRowShield"><span class="sLbl" style="color:#6ab8cc">SHD</span><div class="sBar">${segs(ship.maxShield ?? 0, maxShield)}</div><span class="sVal">${ship.maxShield ?? 0}</span></div>
        <div class="sRow"><span class="sLbl">VEL</span><div class="sBar">${segs(ship.thrustMult, maxSpeed)}</div><span class="sVal">${velDisplay}</span></div>
        <div class="sRow"><span class="sLbl">MSL</span><div class="sBar">${segs(ship.maxMissiles, maxMsl)}</div><span class="sVal">${mslDisplay}</span></div>
        <div class="sRow"><span class="sLbl" title="Firma de radar: a mayor firma, antes te detectan">FIR</span><div class="sBar">${segs(ship.radarSignature, maxRadar)}</div><span class="sVal">${ship.radarSignature}</span></div>
      </div>
      <div class="shipCardDesc">${ship.desc || ""}</div>
    `;
    return btn;
  }

  // #shipCards (sala) y #soloShipCards están migrados a React; solo persiste el
  // panel de muerte legacy (#deadShipCards). Guardamos cada contenedor.
  const container = document.getElementById("shipCards");
  if (container) container.innerHTML = "";
  const deadContainer = document.getElementById("deadShipCards");
  if (deadContainer) deadContainer.innerHTML = "";
  const soloContainer = document.getElementById("soloShipCards");
  if (soloContainer) soloContainer.innerHTML = "";

  for (const [type, ship] of Object.entries(ships)) {
    if (container) container.appendChild(makeCard(type, ship, "prev-"));
    if (deadContainer) deadContainer.appendChild(makeCard(type, ship, "dead-prev-"));
    if (soloContainer) soloContainer.appendChild(makeCard(type, ship, "solo-prev-"));
  }
}

// La sala está migrada a React (Room.tsx). renderPlayers solo notifica a React,
// que renderiza el listado de jugadores/equipos desde getRoomData(). El cuerpo
// legacy queda renombrado como función muerta (no se invoca) hasta su limpieza.
function renderPlayers() {
  window.dispatchEvent(new CustomEvent("room-update"));
}
// Panel de muerte migrado a React (DeadPanel.tsx). La visibilidad pasa por
// setDeadPanelVisible (deduplica: solo emite "dead" al cambiar), porque la
// llaman tanto las transiciones muerte/reaparición como el loop cada frame
// (caso oleadas sin vidas). React monta el panel y delega las acciones en
// game.js (roomSend selectShip/boardShip/switchTeam, roomLeave).
let _deadVisible = false;
function setDeadPanelVisible(v) {
  if (v === _deadVisible) return;
  _deadVisible = v;
  window.dispatchEvent(new CustomEvent("dead", { detail: v }));
}
function showDeadPanel() { setDeadPanelVisible(true); }
function hideDeadPanel() { setDeadPanelVisible(false); }

// Opciones de "ir de torretero": naves aliadas vivas (Gunship/Capital) con torreta
// libre que un jugador muerto puede abordar para reaparecer como artillero.
// Devuelve los datos; React (DeadPanel) los renderiza y refresca por intervalo.
function getTurretOptions() {
  const me = players[myId];
  if (!me) return [];
  const myReservedPilot = me.pilotingFor || null;
  const entries = [];
  Object.values(players).forEach(p => {
    if (p.dead || p.team !== me.team || p.pilotingFor) return;
    if (p.shipType !== "gunship" && p.shipType !== "capital") return;
    const free = p.shipType === "gunship"
      ? (p.gunnerId ? 0 : 1)
      : (p.gunnerIds || [null, null, null]).filter(x => !x).length;
    const reservedHere = myReservedPilot === p.id;
    if (free > 0 || reservedHere) {
      entries.push({ id: p.id, name: p.name || "Pilot", type: p.shipType, free, reservedHere });
    }
  });
  return entries;
}

// Las previews se dibujan en buildShipCards() al recibir el init del servidor

addEventListener("keydown", e => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;

  const key = e.key.toLowerCase();
  keys[key] = true;

  // Evita que teclas de juego desplacen la página (espacio y flechas hacen scroll)
  if (key === " " || key === "spacebar" || key.startsWith("arrow")) e.preventDefault();

  if (bindings.brake && key === bindings.brake) {
    const me = getMe();
    if (me && !me.dead) {
      ws.send(JSON.stringify({ type: "brake" }));
    }
  }

  if (bindings.scan && key === bindings.scan) {
    const me = getMe();
    const now = performance.now();
    if (me && !me.dead && now >= nextPingAt) {
      nextPingAt = now + PING_COOLDOWN_MS;   // 1 ping cada 3 s
      scanUntil = now + 8000;
      pingEnemiesUntil = now + 2000;
      triggerPingEffect(me.x, me.y);
      initAudio();         // asegura el contexto de audio en este gesto de tecla
      playPingSound();     // sonar tipo Star Citizen
    }
  }

  if (bindings.inertiaDamp && key === bindings.inertiaDamp) {
    const me = getMe();
    if (me && !me.dead) inertiaDampActive = !inertiaDampActive;
  }

  // Fallback teclado: shoot / missile
  if (bindings.shoot && key === bindings.shoot) {
    if (isCapitalPilot()) {
      startBeamCharge();
    } else {
      ws.send(JSON.stringify({ type: "shoot" }));
      playShootSound();
    }
  }
  if (bindings.missile && key === bindings.missile && targetId) {
    const meM = getMe();
    const ready = meM && (meM.missileCooldown ?? 0) <= 0 &&
      (meM.missilesActive ?? 0) < (meM.maxMissiles ?? 0);
    if (ready) {
      ws.send(JSON.stringify({ type: "missile", targetId }));
      playMissileSound();
    } else {
      playAlertSound("noMissile");   // sin misiles disponibles / en recarga
    }
  }

  // Tab: scoreboard (mantener) — en modo espectador cicla cámaras
  if (e.key === "Tab") {
    e.preventDefault();
    const meNow = getMe();
    if (meNow && meNow.dead) {
      cycleSpectator();
    } else {
      showScoreboard = true;
    }
  }

  if (bindings.respawn && key === bindings.respawn) {
    const meNow = getMe();
    // Vidas: en oleadas hace falta pool del equipo > 0; en PVP/vuelo libre es infinito
    const canRespawn = waveMode ? (teamLives ?? 0) > 0 : true;
    if (meNow && meNow.dead && canRespawn) {
      const elapsed = clientDeadAt ? Date.now() - clientDeadAt : 99999;
      if (elapsed >= (CFG_RESPAWN_DELAY * 1000)) {
        ws.send(JSON.stringify({ type: "respawn" }));
      }
    }
  }

  if (key === "enter" && !chatInputOpen) {
    e.preventDefault();
    const meNow = getMe();
    if (meNow && !meNow.dead) openChat();
  }

  if (bindings.flare && key === bindings.flare) {
    const meF = getMe();
    if (meF && !meF.pilotingFor && (meF.flaresLeft ?? 1) <= 0) {
      playAlertSound("noFlare");     // sin bengalas en el pool de esta vida
    } else {
      ws.send(JSON.stringify({ type: "flare" }));
    }
  }

  // Habilidad especial (EMP del Disruptor / mina del Interceptor)
  if (bindings.special && key === bindings.special) {
    const meNow = getMe();
    if (meNow && !meNow.dead && !meNow.pilotingFor) {
      ws.send(JSON.stringify({ type: "special" }));
    }
  }

  if (e.key === "F1") {
    e.preventDefault();
    initAudio();
    if (mobiOpen) closeMobiglass();
    else openMobiglass();
  }

  if (e.key === "Delete") {
    if (e.repeat) return;
    e.preventDefault();
    if (chatInputOpen) return;
    const meNow = getMe();
    if (!meNow || meNow.dead) return;
    if (sdState === "countdown") cancelSd();
    else if (!sdState) startSdCharge();
  }
});

addEventListener("keyup", e => {
  // El estado de tecla SIEMPRE se limpia, aunque el foco esté en un input;
  // de lo contrario una tecla soltada mientras se escribe se quedaría "pegada".
  keys[e.key.toLowerCase()] = false;

  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;

  if (e.key === "Tab") showScoreboard = false;
  if (e.key === "Delete" && sdState === "charging") cancelSd();
  if (bindings.shoot && e.key.toLowerCase() === bindings.shoot && beamHeld) releaseBeamCharge();
});

setInterval(() => {
  if (!inGame) return;
  const me = getMe();
  if (!me || me.dead) { beamHeld = false; beamWasReady = false; abilityWasReady = true; return; }  // evita carga "atascada" tras morir
  // Aviso eléctrico al quedar el rayo totalmente cargado (solo en el flanco de subida)
  const beamReady = me.shipType === "capital" && (me.beamCharge ?? 0) >= 0.999;
  if (beamReady && !beamWasReady) playBeamReadySound();
  beamWasReady = beamReady;
  // Aviso al quedar lista la habilidad [X] (EMP / mina), solo en el flanco de subida
  const hasAbility = !me.pilotingFor && (me.shipType === "emp" || me.shipType === "interceptor");
  const abilityCd = me.shipType === "emp" ? (me.empCooldown ?? 0) : (me.mineCooldown ?? 0);
  const abilityReady = hasAbility && abilityCd <= 0;
  if (abilityReady && !abilityWasReady) playAbilityReadySound();
  abilityWasReady = abilityReady;
  const targetAngle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
  ws.send(JSON.stringify({
    type: "input",
    thrust: !!(bindings.thrust && keys[bindings.thrust]),
    reverse: !!(bindings.reverse && keys[bindings.reverse]),
    strafeLeft: !!(bindings.strafeLeft && keys[bindings.strafeLeft]),
    strafeRight: !!(bindings.strafeRight && keys[bindings.strafeRight]),
    inertiaDamp: inertiaDampActive,
    targetAngle
  }));
}, 33);

function getMe() {
  return players[myId];
}

function worldToScreen(x, y, camX, camY) {
  return {
    x: x - camX + canvas.width / 2,
    y: y - camY + canvas.height / 2
  };
}
//LIMITES Y GRID DEL MAPA
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
  asteroids.forEach(a => {
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
    ctx.fillStyle = player.id === myId ? "#00ccff" : "rgba(255,255,255,0.6)";
    ctx.font = "11px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(player.name || "Pilot", pos.x, pos.y + (hasShield ? offY - 12 : offY - 6));
    ctx.restore();
  }

  // ── Target lock reticle (estilo space-sim) ──
  if (player.id === targetId) {
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
  bullets.forEach(b => {
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
  beams.forEach(b => {
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
  empPulses.forEach(e => {
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
  mines.forEach(mn => {
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
  if (!waveMode) return;

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillStyle = "#ff8899";
  const label = waveNum > 0 ? i18nt("hud.waveLabel", { n: waveNum, total: waveTotal }) : i18nt("hud.preparing");
  const vidas = teamLives != null ? `  ·  ${i18nt("game.teamLives")}: ${"♥".repeat(Math.max(0, teamLives)) || "0"}` : "";
  ctx.fillText(`${label}  ·  ${i18nt("hud.enemiesShort")}: ${enemiesLeft}${vidas}`, canvas.width / 2, 70);
  ctx.restore();

  if (waveBanner) {
    const t = Date.now() - waveBannerShownAt;
    const dur = 2600;
    if (t < dur) {
      const a = t < 300 ? t / 300 : (t > dur - 600 ? Math.max(0, (dur - t) / 600) : 1);
      const boss = waveBanner.key === "wave.boss";
      ctx.save();
      ctx.textAlign = "center";
      ctx.globalAlpha = a;
      ctx.fillStyle = boss ? "#ff3355" : "#ffcc44";
      ctx.font = "bold 44px 'Courier New', monospace";
      ctx.shadowColor = boss ? "#ff335588" : "#ffcc4488";
      ctx.shadowBlur = 24;
      ctx.fillText(i18nt(waveBanner.key, { n: waveBanner.n }), canvas.width / 2, canvas.height * 0.28);
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

  const myMines = mines.filter(m => m.ownerId === myId);
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

// Nave "cubierta": posición dentro del radio de un asteroide flotante (z=1, sobre las naves)
function isSheltered(px, py) {
  return asteroids.some(a => a.z === 1 && Math.hypot(px - a.x, py - a.y) < a.r);
}

// Línea de visión bloqueada: algún asteroide de colisión (z=0) intersecta el segmento
function losBlocked(ax, ay, bx, by) {
  return asteroids.some(a => a.z === 0 && ptSegDist(a.x, a.y, ax, ay, bx, by) < a.r);
}
// ──────────────────────────────────────────────

function radarVisibleEnemies() {
  const me = players[myId];
  if (!me) return [];
  return Object.values(players).filter(p => {
    if (p.dead || p.team === me.team || p.pilotingFor) return false;
    if (Math.hypot(p.x - me.x, p.y - me.y) > (p.radarSignature || 450)) return false;
    if (isSheltered(p.x, p.y)) return false;       // bajo asteroide flotante → oculto
    if (losBlocked(me.x, me.y, p.x, p.y)) return false; // asteroide sólido entre medias
    return true;
  });
}

function cycleTarget() {
  const enemies = radarVisibleEnemies();
  if (enemies.length === 0) { targetId = null; return; }
  if (!targetId) { targetId = enemies[0].id; return; }
  const idx = enemies.findIndex(e => e.id === targetId);
  if (idx === -1) { targetId = enemies[0].id; return; }
  if (idx === enemies.length - 1) { targetId = null; return; }
  targetId = enemies[idx + 1].id;
}

function cycleTargetByRadar() {
  const enemies = radarVisibleEnemies();
  if (enemies.length === 0) { targetId = null; return; }
  if (!targetId) { targetId = enemies[0].id; return; }
  const idx = enemies.findIndex(e => e.id === targetId);
  if (idx === -1) { targetId = enemies[0].id; return; }
  // Al llegar al último → deslockear (null); siguiente click vuelve al primero
  targetId = idx === enemies.length - 1 ? null : enemies[idx + 1].id;
}
function drawMissiles(camX, camY) {

  missiles.forEach(m => {

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

  flares.forEach(f => {

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
  if (readyBtn) readyBtn.disabled = uiState !== "inRoom";
}

//RADAR
function drawRadar() {
  const scanning = performance.now() < scanUntil;
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

  Object.values(players).forEach(p => {

    // Enemigos: filtro de radar (firma, cobertura de asteroide, LOS)
    if (me && p.team !== me.team) {
      const pinging = performance.now() < pingEnemiesUntil;
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

    const rx = x + ((p.x / world.width) - 0.5) * size;
    const ry = y + ((p.y / world.height) - 0.5) * size;

    const blipR =
      p.shipType === "bomber" ? 5 :
        p.shipType === "interceptor" ? 2.5 :
          3.5;

    ctx.beginPath();
    ctx.arc(rx, ry, blipR, 0, Math.PI * 2);

    ctx.fillStyle =
      p.dead ? "#555" :
        p.id === myId ? "#00ccff" :
          p.team === "green" ? "#00ff88" :
            "#ff3355";

    ctx.fill();
  });
  if (scanning) {
    // ── Asteroids on radar
    asteroids.forEach(a => {

      const rx = x + (a.x / world.width - 0.5) * size;
      const ry = y + (a.y / world.height - 0.5) * size;

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
  const ship = me.pilotingFor ? (players[me.pilotingFor] || me) : me;

  // ── Avisos de voz (voz robótica femenina), disparados por flanco ──
  if (typeof playVoiceAlert === "function" && !me.dead) {
    const lang = (typeof getLang === "function") ? getLang() : "es";
    // Combustible bajo (< 25 %) con histéresis para no repetir
    if (ship.fuel < 25) {
      if (!_voiceFuelLow) { _voiceFuelLow = true; playVoiceAlert(i18nt("voice.lowFuel"), lang); }
    } else if (ship.fuel > 32) { _voiceFuelLow = false; }
    // Escudos caídos (solo naves con escudo)
    if ((ship.maxShield ?? 0) > 0 && (ship.shield ?? 0) <= 0) {
      if (!_voiceShieldDown) { _voiceShieldDown = true; playVoiceAlert(i18nt("voice.shieldsDown"), lang); }
    } else if ((ship.shield ?? 0) > 0) { _voiceShieldDown = false; }
  } else {
    _voiceFuelLow = false; _voiceShieldDown = false;
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
    inertiaEl.textContent = inertiaDampActive ? i18nt("hud.coupled") : i18nt("hud.decoupled");
    inertiaEl.style.color = inertiaDampActive ? "#555" : "#8aa8b8";
  }

  const heatEl = document.getElementById("weaponHeatEl");
  if (heatEl) {
    const heatPct = Math.round(weaponHeat);
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
    Object.values(players)
      .filter(p => !p.dead)
      .length;

  document.getElementById("alive").textContent = i18nt("hud.alive", { n: alive });

  if (targetId) {
    const t = players[targetId];
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
  if (targetId) {
    const tgt = players[targetId];
    const mePl = players[myId];
    if (!mePl || mePl.dead || !tgt || tgt.dead ||
      (isSheltered(tgt.x, tgt.y) || losBlocked(mePl.x, mePl.y, tgt.x, tgt.y))) {
      targetId = null;
    }
  }

  updateParticles();

  const me = getMe();

  // ── Camera: spectator or normal
  let camX, camY;
  if (me && me.dead) {
    let spec = specTargetId ? players[specTargetId] : null;
    if (!spec || spec.dead) {
      const living = Object.values(players).filter(p => !p.dead && p.id !== myId);
      spec = living[0] || null;
      specTargetId = spec ? spec.id : null;
    }
    camX = spec ? spec.x : me.x;
    camY = spec ? spec.y : me.y;
  } else if (me) {
    camX = me.x;
    camY = me.y;
    specTargetId = null;
  } else {
    camX = 0; camY = 0;
  }

  // ── Screen shake
  if (shakeMag > 0.5) {
    camX += (Math.random() - 0.5) * shakeMag;
    camY += (Math.random() - 0.5) * shakeMag;
    shakeMag *= 0.82;
  } else {
    shakeMag = 0;
  }

  // ── Thrust particles for local player (no para artilleros)
  if (me && !me.dead && !me.pilotingFor && bindings.thrust && keys[bindings.thrust]) {
    spawnThrustParticle(me.x, me.y, me.angle);
  }

  // ── Humo de daño para todas las naves con HP bajo (lado trasero)
  Object.values(players).forEach(p => {
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

  Object.values(players).forEach(p => drawVelocityVector(p, camX, camY));
  Object.values(players).forEach(p => drawShip(p, camX, camY));

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
    const pilot = me.pilotingFor ? players[me.pilotingFor] : null;
    setMissileWarning(!me.dead && !!(me.lockedByMissile || pilot?.lockedByMissile));

    if (me.dead) {
      //if (!deadPanel.classList.contains("hidden")) renderDeadTurretOptions();
      const reservedPilot = me.pilotingFor ? players[me.pilotingFor] : null;
      const inTurret = !!(reservedPilot && !reservedPilot.dead);

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 40px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(i18nt("game.destroyed"), canvas.width / 2, canvas.height / 2 - 30);
      // Vidas: oleadas → pool de equipo; PVP/vuelo libre → infinito
      const canRespawn = waveMode ? (teamLives ?? 0) > 0 : true;
      // El panel de muerte lo monta React (evento "dead"); aquí solo ajustamos
      // visibilidad (dedupe) y dibujamos la cuenta atrás de reaparición en canvas.
      setDeadPanelVisible(canRespawn);
      if (canRespawn) {
        const elapsed = clientDeadAt ? Date.now() - clientDeadAt : 99999;
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
        const vidasTxt = waveMode
          ? i18nt("game.teamLivesN", { n: teamLives })
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

  if (winner) {

    if (winner !== prevWinner) {
      prevWinner = winner;

      clearTimeout(gameOverTimer);
      gameOverTimer = setTimeout(() => {
        showGameOver();
      }, 2500);

      if (mobiOpen) closeMobiglass();
    }

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.textAlign = "center";

    ctx.fillStyle = winner === "draw" ? "#ffcc00" : winner === "green" ? "#00ff88" : "#ff3355";
    ctx.font = "bold 52px 'Courier New', monospace";
    let resultText;
    if (waveMode) {
      // Modo oleadas: resultado de práctica (sin equipos)
      resultText = winner === "green" ? i18nt("result.wavesWon") : i18nt("result.wavesLost");
    } else {
      resultText = winner === "draw"
        ? i18nt("result.draw")
        : (winner === "green" ? i18nt("result.greenWins") : i18nt("result.redWins"));
    }
    ctx.fillText(resultText, cx, cy - 90);

    const sorted = Object.values(players).sort((a, b) => {
      if (a.team !== b.team) return a.team === winner ? -1 : 1;
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
      const me_m = p.id === myId ? " ◄" : "";
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
  const recentKills = killFeed.filter(e => now - e.time < 5000);
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
  const recentChat = chatLog.filter(m => now - m.ts < 7000);

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
  if (chatLog.length > 0) {

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
  if (me && me.dead && specTargetId) {
    const spec = players[specTargetId];
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
  if (showScoreboard) {
    const rem = 18; // 1rem base

    const green = Object.values(players)
      .filter(p => p.team === "green")
      .sort((a, b) => (b.kills || 0) - (a.kills || 0));

    const red = Object.values(players)
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
        const isMe = p.id === myId;

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

// ── Superficie pública para la UI React ──────────────────────────────
export {
  // Controles / bindings
  getBindings, rebindKey, resetBindings, onBindingsChange,
  BINDING_LABELS, RESERVED_KEYS, DEFAULT_BINDINGS, displayKey, bindingText,
  // Menú principal
  getPlayerName, setPlayerName, menuPlayOnline, menuSolo, menuMain, getMenuScreen, SUPPORT_URL,
  // Datos de nave + práctica solo (puente para React)
  getShips, drawShipPreview, startSolo,
  // Lista de salas Co-op (puente para React)
  getRoomList, lobbyCreateRoom, lobbyRefresh, lobbyJoin,
  // Sala / lobby con equipos (puente para React)
  getRoomData, getMyId, roomSend, roomToggleReady, roomSwitchTeam, roomLeave,
  // MobiGlass en partida (puente para React)
  getMe, getPlayers, closeMobiglass,
  getAudioSettings, setAudioEffects, setAudioMusic, setAudioTrack, setAudioMuted,
  // Overlays en partida: game over / chat / panel de muerte (puente para React)
  gameRestart, chatSend, getTurretOptions,
};

loop();