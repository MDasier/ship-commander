const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// ── Keybindings ────────────────────────────────
const DEFAULT_BINDINGS = {
  thrust: "w",
  reverse: "s",
  strafeLeft: "a",
  strafeRight: "d",
  shoot: "e",
  missile: "q",
  flare: "f",
  special: "x",
  respawn: "r",
  scan: "c",
  inertiaDamp: "z",
};

const BINDING_LABELS = {
  thrust: "Propulsión",
  reverse: "Retroceso",
  strafeLeft: "Strafe izquierda",
  strafeRight: "Strafe derecha",
  shoot: "Disparar (teclado)",
  missile: "Misil (teclado)",
  flare: "Bengala",
  special: "Habilidad especial (EMP / mina)",
  respawn: "Reaparecer",
  scan: "Escaneo radar",
  inertiaDamp: "Toggle inercia",
};

// Teclas que no se pueden asignar (fijas)
const RESERVED_KEYS = new Set(["tab", "f1", "delete", "escape"]);

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

function renderControlesPane() {
  cancelRecording();
  const pane = document.getElementById("pane-controles");
  pane.innerHTML = "";

  const table = document.createElement("table");
  table.className = "mobiControls bindingTable";

  for (const [action, label] of Object.entries(BINDING_LABELS)) {
    const tr = document.createElement("tr");

    const tdLabel = document.createElement("td");
    tdLabel.textContent = label;

    const tdKey = document.createElement("td");
    tdKey.className = "bindingKeyCell";
    tdKey.dataset.action = action;
    tdKey.innerHTML = `<kbd>${displayKey(bindings[action])}</kbd>`;

    const tdBtn = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "bindingChangeBtn";
    btn.textContent = "Cambiar";
    btn.onclick = () => startRecording(action, tdKey);
    tdBtn.appendChild(btn);

    tr.appendChild(tdLabel);
    tr.appendChild(tdKey);
    tr.appendChild(tdBtn);
    table.appendChild(tr);
  }

  const resetBtn = document.createElement("button");
  resetBtn.className = "bindingChangeBtn";
  resetBtn.style.marginTop = "14px";
  resetBtn.textContent = "↺ Restaurar por defecto";
  resetBtn.onclick = () => {
    bindings = { ...DEFAULT_BINDINGS };
    saveBindings();
    renderControlesPane();
  };

  const fixedDiv = document.createElement("div");
  fixedDiv.innerHTML = `
    <div class="bindingFixedTitle">FIJOS</div>
    <table class="mobiControls" style="color:#3a5060">
      <tr><td><kbd>Mouse</kbd></td><td>Apuntar / girar</td></tr>
      <tr><td><kbd>Clic Izq.</kbd></td><td>Disparar</td></tr>
      <tr><td><kbd>Clic Der.</kbd></td><td>Lockear / Misil</td></tr>
      <tr><td><kbd>Tab ⟨mantener⟩</kbd></td><td>Marcador</td></tr>
      <tr><td><kbd>F1</kbd></td><td>MobiGlass</td></tr>
      <tr><td><kbd>Del</kbd></td><td>Autodestrucción</td></tr>
    </table>
  `;

  pane.appendChild(table);
  pane.appendChild(resetBtn);
  pane.appendChild(fixedDiv);
}

// ── Ship geometry definitions ──────────────────
const SHIP_SHAPES = {

  interceptor: {
    body: [
      [22, 0],
      [16, -4], [8, -7], [2, -8],
      [-2, -20], [-10, -26], [-18, -22],
      [-20, -8], [-22, -4], [-24, 0],
      [-22, 4], [-20, 8],
      [-18, 22], [-10, 26], [-2, 20],
      [2, 8], [8, 7], [16, 4],
    ],
    engine: [[-24, -4], [-32, 0], [-24, 4]],
    hpBarW: 34,
    uiOffY: -30,
    shieldR: 34,
  },

  fighter: {
    body: [
      [22, 0],
      [16, -5], [10, -9], [4, -14],
      [-2, -22], [-10, -24], [-16, -18],
      [-20, -12], [-22, -6], [-24, 0],
      [-22, 6], [-20, 12],
      [-16, 18], [-10, 24], [-2, 22],
      [4, 14], [10, 9], [16, 5],
    ],
    engine: [[-24, -6], [-32, 0], [-24, 6]],
    hpBarW: 44,
    uiOffY: -30,
    shieldR: 40,
  },


  bomber: {
    body: [
      [30, 0],
      [24, -5], [14, -8], [4, -9], [-4, -9], [-10, -9],
      [-14, -16], [-18, -22], [-22, -18], [-24, -8],
      [-26, 0],
      [-24, 8], [-22, 18], [-18, 22], [-14, 16],
      [-10, 9], [-4, 9], [4, 9], [14, 8], [24, 5],
    ],
    engine: [[-26, -12], [-36, 0], [-26, 12]],
    hpBarW: 62,
    uiOffY: -32,
    shieldR: 48,
  },


  gunship: {
    body: [
      [28, 0],
      [20, -10], [12, -20], [4, -30], [-8, -36],
      [-18, -32], [-22, -22],
      [-16, -14],
      [-22, -6], [-26, 0], [-22, 6],
      [-16, 14],
      [-22, 22],
      [-18, 32], [-8, 36],
      [4, 30], [12, 20], [20, 10],
    ],
    engine: [[-26, -14], [-38, 0], [-26, 14]],
    hpBarW: 90,
    uiOffY: -46,
    shieldR: 58,
  },

  emp: {
    // Triángulo ancho y corto con el pico en el morro (+x = proa)
    body: [
      [24, 0],            // pico (morro)
      [-14, -40],         // ala babor (muy ancha)
      [-6, 0],            // muesca trasera central (motor)
      [-14, 40],          // ala estribor
    ],
    engine: [[-14, -9], [-28, 0], [-14, 9]],
    hpBarW: 70,
    uiOffY: -50,
    shieldR: 46,
  },

  capital: {
    // Silueta tipo Idris: proa estrecha y puntiaguda (+x) que se ensancha
    // progresivamente hacia la popa, donde está el ancho bloque de motores.
    body: [
      [85, 0],                                   // proa (punta estrecha)
      [73, -7], [60, -13], [44, -19],            // morro afilado
      [26, -27], [6, -35], [-16, -43],           // casco ensanchándose
      [-38, -46], [-56, -43],                    // sección más ancha (popa)
      [-67, -35], [-73, -37],                    // góndola de motor (estribor)
      [-78, -20], [-78, 0], [-78, 20],           // bloque trasero
      [-73, 37], [-67, 35],                      // góndola de motor (babor)
      [-56, 43], [-38, 46],                      // sección más ancha (popa)
      [-16, 43], [6, 35], [26, 27],              // casco estrechándose
      [44, 19], [60, 13], [73, 7],               // morro afilado
    ],
    engine: [[-78, -24], [-98, 0], [-78, 24]],
    hpBarW: 170,
    uiOffY: -60,
    shieldR: 90,
    // Posiciones de las 3 torretas en coordenadas locales de nave
    turretHardpoints: [
      [20, -24],   // torreta de proa izquierda
      [20, 24],   // torreta de proa derecha
      [-48, 0],   // torreta trasera
    ],
  },
};

const pingEffect = [];
function triggerPingEffect(x, y) {
  pingEffect.push({
    x,
    y,
    start: performance.now(),
    duration: 1200
  });
}

function getShapeDef(type) {
  return SHIP_SHAPES[type] || SHIP_SHAPES.fighter;
}

// Draw a ship polygon path (no fill/stroke — caller does that)
function buildShipPath(c, type) {
  const pts = getShapeDef(type).body;
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}

// Draw preview silhouettes into the selector canvases
function drawShipPreviewInto(el, type, shape) {
  const pc = el.getContext("2d");
  const w = el.width, h = el.height;
  pc.clearRect(0, 0, w, h);
  pc.save();
  pc.translate(w / 2, h / 2);
  const rotated = type === "gunship";
  if (rotated) pc.rotate(-Math.PI / 2);
  const xs = shape.body.map(p => p[0]);
  const ys = shape.body.map(p => p[1]);
  const bW = rotated ? (Math.max(...ys) - Math.min(...ys)) : (Math.max(...xs) - Math.min(...xs));
  const bH = rotated ? (Math.max(...xs) - Math.min(...xs)) : (Math.max(...ys) - Math.min(...ys));
  const sc = Math.min((w * 0.88) / bW, (h * 0.88) / bH);
  pc.scale(sc, sc);
  pc.beginPath();
  buildShipPath(pc, type);
  pc.fillStyle = "#00ccff55";
  pc.strokeStyle = "#00ccff";
  pc.lineWidth = 1.5 / sc;
  pc.fill();
  pc.stroke();
  const eng = shape.engine;
  pc.beginPath();
  pc.moveTo(eng[0][0], eng[0][1]);
  pc.lineTo(eng[1][0], eng[1][1]);
  pc.lineTo(eng[2][0], eng[2][1]);
  pc.strokeStyle = "#00aaff88";
  pc.lineWidth = 1 / sc;
  pc.stroke();
  pc.restore();
}

function drawShipPreviews() {
  for (const [type, shape] of Object.entries(SHIP_SHAPES)) {
    const el = document.getElementById("prev-" + type);
    if (el) drawShipPreviewInto(el, type, shape);
    const el2 = document.getElementById("dead-prev-" + type);
    if (el2) drawShipPreviewInto(el2, type, shape);
  }
}

canvas.width = innerWidth;
canvas.height = innerHeight;

addEventListener("resize", () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
});

const _wsProto = location.protocol === "https:" ? "wss:" : "ws:";
const _wsHost = location.hostname ? location.host : "localhost:8080";
const ws = new WebSocket(_wsProto + "//" + _wsHost);

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
let asteroids = [];

let targetId = null;
let missiles = [];
let flares = [];
let scanUntil = 0;
let pingEnemiesUntil = 0;
let inertiaDampActive = true;

let world = {
  width: 6000,
  height: 6000
};

let winner = null;
let prevWinner = null;

// ── Client-side interpolation ──────────────────
const INTERP_DELAY = 80;  // ms behind server time (~2.5 ticks at 30fps)
const MAX_BUFFER = 12;
let stateBuffer = [];  // [{time, players, bullets, missiles, flares}]

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function extrapolateArr(arr, ticks) {
  return arr.map(e => ({ ...e, x: e.x + e.vx * ticks, y: e.y + e.vy * ticks }));
}

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

const menu = document.getElementById("menu");
const lobbyDiv = document.getElementById("lobby");
const roomDiv = document.getElementById("room");

const roomsDiv = document.getElementById("rooms");
const playersDiv = document.getElementById("players");

const hud = document.getElementById("hud");

// ── Mobiglass
const mobiglassEl = document.getElementById("mobiglass");
const mobiPlayerEl = document.getElementById("mobiPlayer");
const mobiStatusEl = document.getElementById("mobiStatus");
const mobiPilotBadge = document.getElementById("mobiPilotBadge");
let mobiOpen = false;
let mobiActiveTab = "piloto";

// Tab switching
document.getElementById("mobiTabBar").addEventListener("click", e => {
  const btn = e.target.closest(".mobiTab");
  if (!btn) return;
  const pane = btn.dataset.pane;
  document.querySelectorAll(".mobiTab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".mobiPane").forEach(p => p.classList.add("hidden"));
  document.getElementById("pane-" + pane).classList.remove("hidden");
  mobiActiveTab = pane;
  updateMobiPane(pane);
});

// Close button
document.getElementById("mobiCloseBtn").onclick = closeMobiglass;

// Click outside panel closes it
mobiglassEl.addEventListener("click", e => {
  if (e.target === mobiglassEl) closeMobiglass();
});

function openMobiglass() {
  const me = getMe();
  if (!me) return;
  mobiOpen = true;
  mobiglassEl.classList.remove("hidden");
  updateMobiglass();
}

function closeMobiglass() {
  mobiOpen = false;
  mobiglassEl.classList.add("hidden");
}

function updateMobiPane(tab) {
  if (tab === "piloto") updateMobiPiloto();
  if (tab === "partida") updateMobiPartida();
  if (tab === "ajustes") initAjustesPane();
  if (tab === "controles") renderControlesPane();
}

// ── AJUSTES pane ──────────────────────────────
let ajustesReady = false;

function initAjustesPane() {
  if (ajustesReady) return;
  ajustesReady = true;

  const effectsSlider = document.getElementById("volEffects");
  const effectsVal = document.getElementById("volEffectsVal");
  const musicSlider = document.getElementById("volMusic");
  const musicVal = document.getElementById("volMusicVal");
  const muteBtn = document.getElementById("muteBtn");
  const trackSel = document.getElementById("musicTrackSel");

  const savedEffects = parseFloat(localStorage.getItem("vol_effects") ?? "0.8");
  const savedMusic = parseFloat(localStorage.getItem("vol_music") ?? "0.5");
  const savedTrack = localStorage.getItem("music_track") ?? "A";
  const savedMuted = localStorage.getItem("audio_muted") === "1";

  effectsSlider.value = savedEffects;
  effectsVal.textContent = Math.round(savedEffects * 100) + "%";
  musicSlider.value = savedMusic;
  musicVal.textContent = Math.round(savedMusic * 100) + "%";
  trackSel.value = savedTrack;

  function refreshMuteBtn() {
    muteBtn.textContent = savedMutedState() ? "🔇 Silenciado" : "🔊 Sonido";
    muteBtn.classList.toggle("muted", savedMutedState());
  }
  function savedMutedState() { return localStorage.getItem("audio_muted") === "1"; }

  effectsSlider.addEventListener("input", () => {
    const v = parseFloat(effectsSlider.value);
    effectsVal.textContent = Math.round(v * 100) + "%";
    setEffectsVolume(v);
    localStorage.setItem("vol_effects", v);
  });

  musicSlider.addEventListener("input", () => {
    const v = parseFloat(musicSlider.value);
    musicVal.textContent = Math.round(v * 100) + "%";
    setMusicVolume(v);
    localStorage.setItem("vol_music", v);
  });

  trackSel.addEventListener("change", () => {
    localStorage.setItem("music_track", trackSel.value);
    setMusicTrack(trackSel.value);
  });

  muteBtn.addEventListener("click", () => {
    const next = !savedMutedState();
    localStorage.setItem("audio_muted", next ? "1" : "0");
    setMuted(next);
    refreshMuteBtn();
  });

  refreshMuteBtn();
}

function applyStoredVolumes() {
  const effects = parseFloat(localStorage.getItem("vol_effects") ?? "0.8");
  const music = parseFloat(localStorage.getItem("vol_music") ?? "0.5");
  const track = localStorage.getItem("music_track") ?? "A";
  const isMutedStored = localStorage.getItem("audio_muted") === "1";
  setEffectsVolume(effects);
  setMusicVolume(music);
  setMusicTrack(track);
  setMuted(isMutedStored);
}

function updateMobiglass() {
  const me = getMe();
  if (!me) return;
  mobiPilotBadge.textContent = me.name || "Pilot";
  updateMobiPane(mobiActiveTab);
}

function updateMobiPiloto() {
  const me = getMe();
  if (!me) return;
  const teamColor = me.team === "green" ? "#00ff88" : "#ff3355";
  const teamName = me.team === "green" ? "VERDE" : "ROJO";
  const hp = Math.max(0, Math.floor(me.hp));
  const fuel = Math.max(0, Math.floor(me.fuel));
  const hpColor = hp > 50 ? "#00ff88" : hp > 25 ? "#ffaa00" : "#ff3355";
  const spd = Math.floor(Math.hypot(me.vx || 0, me.vy || 0));
  const msl = me.missileCooldown > 0
    ? `<span style="color:#ff6644">${Math.ceil(me.missileCooldown / 30)}s</span>`
    : `<span style="color:#00ff88">LISTO</span>`;

  mobiPlayerEl.innerHTML = `
    <div class="mobiPilotHeader">
      <span class="mobiCallsign">${me.name || "Pilot"}</span>
      <span class="mobiTeamBadge" style="color:${teamColor};border-color:${teamColor}44">${teamName}</span>
    </div>

    <div class="mobiStat">
      <div class="mobiStatRow">
        <span class="mobiStatLabel">INTEGRIDAD ESTRUCTURAL</span>
        <span class="mobiStatVal">${hp}%</span>
      </div>
      <div class="mobiBar"><div class="mobiBarFill" style="width:${hp}%;background:${hpColor}"></div></div>
    </div>

    <div class="mobiStat">
      <div class="mobiStatRow">
        <span class="mobiStatLabel">COMBUSTIBLE</span>
        <span class="mobiStatVal">${fuel}%</span>
      </div>
      <div class="mobiBar"><div class="mobiBarFill" style="width:${fuel}%;background:#00aaff"></div></div>
    </div>

    <div class="mobiDivider"></div>

    <div class="mobiGrid">
      <div class="mobiGridCell">
        <span class="mobiGridLabel">BAJAS</span>
        <span class="mobiGridVal">${me.kills || 0}</span>
      </div>
      <div class="mobiGridCell">
        <span class="mobiGridLabel">MUERTES</span>
        <span class="mobiGridVal">${me.deaths || 0}</span>
      </div>
      <div class="mobiGridCell">
        <span class="mobiGridLabel">VELOCIDAD</span>
        <span class="mobiGridVal">${spd}</span>
      </div>
      <div class="mobiGridCell">
        <span class="mobiGridLabel">MISIL</span>
        <span class="mobiGridVal" style="font-size:14px">${msl}</span>
      </div>
    </div>

    ${me.dead ? `
      <div class="mobiDivider"></div>
      <button id="mobiSwitchTeamBtn" style="width:100%;margin:0;padding:10px;border-color:#ffffff22;color:#888;letter-spacing:2px;font-size:11px">
        ⇄ CAMBIAR EQUIPO
      </button>
    ` : ''}
  `;

  const switchBtn = document.getElementById("mobiSwitchTeamBtn");
  if (switchBtn) {
    switchBtn.onmouseenter = () => switchBtn.style.borderColor = "#00ccff55";
    switchBtn.onmouseleave = () => switchBtn.style.borderColor = "#ffffff22";
    switchBtn.onclick = () => ws.send(JSON.stringify({ type: "switchTeam" }));
  }
}

function updateMobiPartida() {
  const green = Object.values(players).filter(p => p.team === "green").sort((a, b) => (b.kills || 0) - (a.kills || 0));
  const red = Object.values(players).filter(p => p.team === "red").sort((a, b) => (b.kills || 0) - (a.kills || 0));

  const renderTeam = (list, color, label) => {
    const alive = list.filter(p => !p.dead).length;
    return `
      <div class="mobiTeamSection">
        <div class="mobiTeamHead" style="color:${color}">
          <span>${label}</span>
          <span>${alive} / ${list.length} vivos</span>
        </div>
        ${list.map(p => `
          <div class="mobiPlayerEntry ${p.dead ? 'dead' : ''}">
            <span class="mobiPlayerBullet" style="color:${p.dead ? '#222' : color}">${p.dead ? '✕' : '●'}</span>
            <span class="mobiPlayerName ${p.id === myId ? 'me' : ''}">${p.name || 'Pilot'}</span>
            <span class="mobiPlayerKD">${p.kills || 0}K · ${p.deaths || 0}D</span>
          </div>
        `).join('')}
      </div>
    `;
  };

  let hostHtml = "";
  if (roomData && roomData.ownerId === myId) {
    const mjOn = roomData.allowJoinMidGame;
    hostHtml = `
      <div class="mobiDivider"></div>
      <div class="mobiStatRow" style="margin-top:4px">
        <span class="mobiStatLabel">UNIRSE EN PARTIDA</span>
        <button id="mobiToggleMidGame" style="font-size:11px;padding:4px 12px;border-color:${mjOn ? '#00ff8855' : '#ffffff11'};color:${mjOn ? '#00ff88' : '#555'};background:transparent;font-family:inherit;cursor:pointer">
          ${mjOn ? 'ACTIVADO' : 'DESACTIVADO'}
        </button>
      </div>
    `;
  }

  mobiStatusEl.innerHTML =
    renderTeam(green, "#00ff88", "EQUIPO VERDE") +
    renderTeam(red, "#ff3355", "EQUIPO ROJO") +
    hostHtml;

  const mobiToggle = document.getElementById("mobiToggleMidGame");
  if (mobiToggle) mobiToggle.onclick = () => ws.send(JSON.stringify({ type: "toggleMidGameJoin" }));
}

// ── Game Over
const gameOverEl = document.getElementById("gameOver");
const restartBtn = document.getElementById("restartBtn");

function showGameOver() {
  if (uiState !== "inRoom") return;
  if (!winner) return;

  gameOverEl.classList.remove("hidden");
  const isHost = roomData && roomData.ownerId === myId;
  restartBtn.classList.toggle("hidden", !isHost);
  const hostHint = document.getElementById("gameOverHostHint");
  const guestHint = document.getElementById("gameOverGuestHint");
  if (hostHint) hostHint.classList.toggle("hidden", !isHost);
  if (guestHint) guestHint.classList.toggle("hidden", isHost);
  playVictorySound();
  stopMusic();
  hideDeadPanel();
}

function hideGameOver() {
  gameOverEl.classList.add("hidden");
  restartBtn.classList.add("hidden");
}

function resetClientState() {
  players = {}; bullets = []; missiles = []; asteroids = [];
  flares = []; winner = null; prevWinner = null; targetId = null;
  stateBuffer = [];
  specTargetId = null; deadIds = new Set(); killFeed = []; chatLog = [];
  shakeMag = 0;
  asteroidCache.clear();
  cancelSd();
  hideDeadPanel();
}

restartBtn.onclick = () => {
  ws.send(JSON.stringify({ type: "restartGame" }));
};

document.getElementById("backToLobby").onclick = () => {

  clearTimeout(gameOverTimer);
  gameOverTimer = null;  
  winner = null;
  prevWinner = null;  
  hideGameOver();

  ws.send(JSON.stringify({ type: "leaveRoom" }));
  resetClientState();
  uiState = "lobby";
  currentRoomId = null;
  roomData = null;
  resetAudio();
  hideGameOver();
  closeMobiglass();
  menu.style.display = "";
  hud.classList.add("hidden");
  roomDiv.classList.add("hidden");
  lobbyDiv.classList.remove("hidden");
  updateUI();
  ws.send(JSON.stringify({ type: "getRooms" }));
};

// ── Chat
const chatContainer = document.getElementById("chatContainer");
const chatInput = document.getElementById("chatInput");
let chatInputOpen = false;

function openChat() {
  chatInputOpen = true;
  chatContainer.classList.remove("hidden");
  chatInput.value = "";
  chatInput.focus();
}

function closeChat() {
  chatInputOpen = false;
  chatContainer.classList.add("hidden");
  chatInput.blur();
}

chatInput.addEventListener("keydown", e => {
  e.stopPropagation();
  if (e.key === "Enter") {
    const text = chatInput.value.trim();
    if (text) ws.send(JSON.stringify({ type: "chat", text }));
    closeChat();
  }
  if (e.key === "Escape") closeChat();
});

canvas.addEventListener("mousemove", e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

document.addEventListener("contextmenu", e => e.preventDefault());

// ── Weapon heat system
let weaponHeat = 0;          // 0..100
let mouseLeftHeld = false;
let weaponFireTimer = null;
const HEAT_PER_SHOT = 12;  // calor por disparo (click individual = 0 penalización acumulada)
const HEAT_DECAY_MS = 30;  // ms por tick de enfriamiento
const HEAT_DECAY_AMT = 2;   // calor que baja por tick
const BASE_FIRE_MS = 130; // intervalo base (ms) al mantener pulsado

function fireWeapon() {
  const me = getMe();
  if (!me || me.dead || hud.classList.contains("hidden")) {
    stopAutoFire();
    return;
  }
  ws.send(JSON.stringify({ type: "shoot" }));
  playShootSound();
  weaponHeat = Math.min(100, weaponHeat + HEAT_PER_SHOT);
  // Programar el siguiente disparo con intervalo aumentado por calor
  if (mouseLeftHeld) {
    const interval = BASE_FIRE_MS * (1 + weaponHeat * 0.025);
    weaponFireTimer = setTimeout(fireWeapon, interval);
  }
}

function stopAutoFire() {
  mouseLeftHeld = false;
  if (weaponFireTimer) { clearTimeout(weaponFireTimer); weaponFireTimer = null; }
}

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
function releaseBeamCharge() {
  if (!beamHeld) return;
  beamHeld = false;
  const me = getMe();
  if (me && (me.beamCharge ?? 0) >= 0.999) playBeamFireSound();  // solo si llegó a disparar
  ws.send(JSON.stringify({ type: "beamCharge", charging: false }));
}
let beamWasReady = false;     // para sonar el aviso eléctrico al quedar listo el rayo
let abilityWasReady = true;   // idem para la habilidad [X] (arranca lista → sin aviso inicial)

// Enfriamiento pasivo de arma
setInterval(() => {
  if (weaponHeat > 0) weaponHeat = Math.max(0, weaponHeat - HEAT_DECAY_AMT);
}, HEAT_DECAY_MS);

canvas.addEventListener("mousedown", e => {
  if (hud.classList.contains("hidden")) return;
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

canvas.addEventListener("mouseleave", () => { releaseBeamCharge(); stopAutoFire(); });

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

// ── Name input
const nameInput = document.getElementById("nameInput");

const savedName = localStorage.getItem("spacetactics_name");
if (savedName) nameInput.value = savedName;

function applyName() {
  const name = nameInput.value.trim() || "Pilot";
  nameInput.value = name;
  localStorage.setItem("spacetactics_name", name);
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "setName", name }));
  }
}

document.getElementById("setNameBtn").onclick = applyName;

nameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") applyName();
});

function requireName() {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    nameInput.classList.add("nameRequired");
    setTimeout(() => nameInput.classList.remove("nameRequired"), 1500);
    return false;
  }
  applyName();
  return true;
}

document.getElementById("createRoom").onclick = () => {
  if (!requireName()) return;
  initAudio();
  applyStoredVolumes();
  ws.send(JSON.stringify({ type: "createRoom" }));
};

document.getElementById("refreshRooms").onclick = () => {
  ws.send(JSON.stringify({
    type: "getRooms"
  }));
};

const readyBtn = document.getElementById("ready");

readyBtn.onclick = () => {
  if (uiState !== "inRoom") return;

  ws.send(JSON.stringify({
    type: "ready"
  }));

  readyBtn.textContent =
    readyBtn.textContent === "Go"
      ? "Ready"
      : "Go";
};

document.getElementById("leaveRoom").onclick = () => {

  clearTimeout(gameOverTimer);
  gameOverTimer = null;

  ws.send(JSON.stringify({ type: "leaveRoom" }));
  uiState = "lobby";
  currentRoomId = null;
  roomDiv.classList.add("hidden");
  lobbyDiv.classList.remove("hidden");
  updateUI();
};

document.getElementById("switchTeam").onclick = () => {
  ws.send(JSON.stringify({
    type: "switchTeam"
  }));
};

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

    lobbyDiv.classList.add("hidden");
    roomDiv.classList.remove("hidden");
    updateUI();
  }

  if (data.type === "roomUpdate") {
    roomData = data.room;
    renderPlayers();
  }

  if (data.type === "balanceError") {
    const hint = document.getElementById("roomHint");
    if (hint) {
      hint.textContent = `⚠ Equipos desequilibrados (Verde: ${data.green} · Rojo: ${data.red}) — iguala los equipos para empezar`;
      hint.style.color = "#ffaa44";
      setTimeout(() => {
        if (hint) { hint.textContent = "Esperando jugadores..."; hint.style.color = ""; }
      }, 6000);
    }
  }

  if (data.type === "gameStarted") {

    menu.style.display = "none";
    hud.classList.remove("hidden");
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
    hud.classList.add("hidden");
    menu.style.display = "";
    lobbyDiv.classList.add("hidden");
    roomDiv.classList.remove("hidden");
    renderPlayers();
    resetAudio();
    updateUI();
  }

  if (data.type === "state") {
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
        if (p.id === myId) { cancelSd(); clientDeadAt = Date.now(); }
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
  }

};

function renderRooms(list) {

  roomsDiv.innerHTML = "";

  if (list.length === 0) {
    roomsDiv.innerHTML = '<div style="color:#444;font-size:12px;padding:12px 0">No hay salas. Crea una.</div>';
    return;
  }

  list.forEach(room => {

    const div = document.createElement("div");
    div.className = "roomItem";

    const playing = room.status === "playing";
    const canJoin = !playing || room.allowJoinMidGame;

    const sizeLabels = { small: "3K", medium: "6K", large: "10K", huge: "15K" };
    const sizeLabel = sizeLabels[room.worldSize] || "6K";
    let statusText = playing ? "EN PARTIDA" : "EN ESPERA";
    if (playing && room.allowJoinMidGame) statusText = "EN PARTIDA · ABIERTA";
    statusText += ` · ${sizeLabel}`;

    div.innerHTML = `
      <span class="roomId">${room.name || '#' + room.id.slice(0, 6)}</span>
      <span class="roomStatus ${playing ? 'playing' : ''} ${playing && room.allowJoinMidGame ? 'open' : ''}">${statusText}</span>
      <span class="roomPlayers">${room.players}/20</span>
      <button ${canJoin ? '' : 'disabled'}>Unirse</button>
    `;

    if (canJoin) {
      div.querySelector("button").onclick = () => {
        if (!requireName()) return;
        initAudio();
        applyStoredVolumes();
        ws.send(JSON.stringify({ type: "joinRoom", roomId: room.id }));
      };
    }

    roomsDiv.appendChild(div);

  });

}
// Etiquetas cortas para la lista de jugadores — se actualizan dinámicamente
const SHIP_LABELS = { interceptor: "INTERCEPTOR", fighter: "L.FIGHTER", bomber: "BOMBER", gunship: "GUNSHIP" };

function speedRating(mult) {
  if (mult >= 1.4) return "+++";
  if (mult >= 0.9) return "++";
  if (mult >= 0.5) return "+";
  return "−−−";
}

function radarRating(sig) {
  if (sig >= 3000) return "+++";   // muy visible
  if (sig >= 1500) return "++";
  if (sig >= 800) return "+";
  return "−−";                     // firma baja = difícil de detectar
}

function buildShipCards(ships) {
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
        <div class="sRow"><span class="sLbl">SIG</span><div class="sBar">${segs(ship.radarSignature, maxRadar)}</div><span class="sVal">${ship.radarSignature}</span></div>
      </div>
      <div class="shipCardDesc">${ship.desc || ""}</div>
    `;
    return btn;
  }

  const container = document.getElementById("shipCards");
  container.innerHTML = "";
  const deadContainer = document.getElementById("deadShipCards");
  deadContainer.innerHTML = "";

  for (const [type, ship] of Object.entries(ships)) {
    container.appendChild(makeCard(type, ship, "prev-"));
    deadContainer.appendChild(makeCard(type, ship, "dead-prev-"));
  }

  drawShipPreviews();
}

function renderPlayers() {
  if (!roomData) return;

  playersDiv.innerHTML = "";
  const isHost = roomData.ownerId === myId;

  // ── Nombre de sala ────────────────────────────
  const nameBar = document.createElement("div");
  nameBar.id = "roomNameBar";
  if (isHost) {
    nameBar.innerHTML = `
      <div class="roomNameEditor">
        <input id="roomNameInput" type="text" maxlength="28"
          value="${(roomData.name || '').replace(/"/g, '&quot;')}"
          placeholder="Nombre de la sala..."
          autocomplete="off" spellcheck="false">
        <button id="roomNameSaveBtn">Guardar</button>
      </div>
    `;
    playersDiv.appendChild(nameBar);
    nameBar.querySelector("#roomNameInput").addEventListener("keydown", e => e.stopPropagation());
    nameBar.querySelector("#roomNameSaveBtn").onclick = () => {
      const val = nameBar.querySelector("#roomNameInput").value.trim();
      ws.send(JSON.stringify({ type: "setRoomName", name: val }));
    };
  } else if (roomData.name) {
    nameBar.innerHTML = `<div class="roomNameText">${roomData.name}</div>`;
    playersDiv.appendChild(nameBar);
  }

  // ── Panel host: toggles + tamaño de mundo ────
  if (isHost) {
    const hostBar = document.createElement("div");
    hostBar.id = "hostBar";
    const mjOn = roomData.allowJoinMidGame;
    const ebOn = roomData.enforceBalance;
    const ws_ = roomData.worldSize || "medium";
    const SIZES = [
      { key: "small", label: "Pequeño 3K", sub: "15 ast." },
      { key: "medium", label: "Medio 6K", sub: "40 ast." },
      { key: "large", label: "Grande 10K", sub: "80 ast." },
      { key: "huge", label: "Enorme 15K", sub: "130 ast." },
    ];
    hostBar.innerHTML = `
      <div class="hostToggleRow">
        <span class="hostBarLabel">Unirse en partida</span>
        <button id="toggleMidGameJoin" class="hostToggleBtn ${mjOn ? 'on' : ''}">${mjOn ? 'ON' : 'OFF'}</button>
      </div>
      <div class="hostToggleRow">
        <span class="hostBarLabel">Equipos equilibrados</span>
        <button id="toggleEnforceBalance" class="hostToggleBtn ${ebOn ? 'on' : ''}">${ebOn ? 'ON' : 'OFF'}</button>
      </div>
      <div class="hostToggleRow worldSizeRow">
        <span class="hostBarLabel">Tamaño del escenario</span>
        <div class="worldSizeBtns">
          ${SIZES.map(s => `
            <button class="worldSizeBtn ${ws_ === s.key ? 'on' : ''}" data-size="${s.key}">
              ${s.label}<br><span class="worldSizeSub">${s.sub}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    hostBar.querySelector("#toggleMidGameJoin").onclick = () =>
      ws.send(JSON.stringify({ type: "toggleMidGameJoin" }));
    hostBar.querySelector("#toggleEnforceBalance").onclick = () =>
      ws.send(JSON.stringify({ type: "toggleEnforceBalance" }));
    hostBar.querySelectorAll(".worldSizeBtn").forEach(btn => {
      btn.onclick = () => ws.send(JSON.stringify({ type: "setWorldSize", size: btn.dataset.size }));
    });
    playersDiv.appendChild(hostBar);
  }

  // ── Barra de equilibrio (visible para todos) ──
  const gc = Object.values(roomData.players).filter(p => p.team === "green").length;
  const rc = Object.values(roomData.players).filter(p => p.team === "red").length;
  const unbalanced = gc !== rc;
  if (gc > 0 || rc > 0) {
    const balBar = document.createElement("div");
    balBar.id = "balanceBar";
    balBar.innerHTML = `
      <span class="balTeam green">🟢 ${gc}</span>
      <span class="balSep">vs</span>
      <span class="balTeam red">🔴 ${rc}</span>
      ${roomData.enforceBalance && unbalanced
        ? `<span class="balWarn">⚠ Desequilibrado — cambia de equipo para iniciar</span>`
        : ""}
    `;
    playersDiv.appendChild(balBar);
  }

  Object.values(roomData.players).forEach(player => {
    const div = document.createElement("div");
    div.className = "playerRow" + (player.id === myId ? " me" : "");

    const team = player.team || "none";
    const youTag = player.id === myId ? '<span class="you">(tú)</span>' : "";
    const readyClass = player.ready ? "ready" : "";
    const readyText = player.ready ? "LISTO" : "ESPERA";
    const shipLabel = SHIP_LABELS[player.shipType] || "CAZA";

    div.innerHTML = `
      <span class="teamDot ${team}"></span>
      <span class="playerName">${player.name || "Pilot"}${youTag}</span>
      <span class="playerShipTag">${shipLabel}</span>
      <span class="playerReady ${readyClass}">${readyText}</span>
    `;

    playersDiv.appendChild(div);

    // Slots de tripulación — Gunship (1 artillero) y Capital (3 artilleros)
    const myP = roomData.players[myId];
    const amGunnerElsewhere = myP && !!myP.pilotingFor;
    const iAmPilot = player.id === myId;

    if (player.shipType === "gunship") {
      const slotDiv = document.createElement("div");
      slotDiv.className = "crewSlot";
      const gunner = player.gunnerId ? roomData.players[player.gunnerId] : null;

      if (gunner) {
        const isMe = player.gunnerId === myId;
        slotDiv.innerHTML = `
          <span class="crewArrow">↳</span>
          <span class="crewRole">ARTILLERO</span>
          <span class="crewName">${gunner.name || "Pilot"}${isMe ? ' <span class="you">(tú)</span>' : ''}</span>
          ${isMe ? '<button class="crewBtn leaveShipBtn">Salir</button>' : ''}
        `;
        if (isMe) slotDiv.querySelector(".leaveShipBtn").onclick = () => ws.send(JSON.stringify({ type: "leaveShip" }));
      } else {
        const canBoard = !iAmPilot && !amGunnerElsewhere;
        slotDiv.innerHTML = `
          <span class="crewArrow">↳</span>
          <span class="crewRole">ARTILLERO</span>
          <span class="crewEmpty">Vacío</span>
          ${canBoard ? `<button class="crewBtn boardBtn" data-pid="${player.id}">Embarcar</button>` : ''}
        `;
        if (canBoard)
          slotDiv.querySelector(".boardBtn").onclick = () =>
            ws.send(JSON.stringify({ type: "boardShip", targetId: player.id }));
      }
      playersDiv.appendChild(slotDiv);
    }

    if (player.shipType === "capital") {
      const gunnerIds = player.gunnerIds || [null, null, null];
      const roleNames = ["TORRETA I", "TORRETA II", "TORRETA III"];
      gunnerIds.forEach((gid, idx) => {
        const slotDiv = document.createElement("div");
        slotDiv.className = "crewSlot";
        const gunner = gid ? roomData.players[gid] : null;
        const isMe = gid === myId;

        if (gunner) {
          slotDiv.innerHTML = `
            <span class="crewArrow">↳</span>
            <span class="crewRole">${roleNames[idx]}</span>
            <span class="crewName">${gunner.name || "Pilot"}${isMe ? ' <span class="you">(tú)</span>' : ''}</span>
            ${isMe ? '<button class="crewBtn leaveShipBtn">Salir</button>' : ''}
          `;
          if (isMe) slotDiv.querySelector(".leaveShipBtn").onclick = () => ws.send(JSON.stringify({ type: "leaveShip" }));
        } else {
          const canBoard = !iAmPilot && !amGunnerElsewhere;
          slotDiv.innerHTML = `
            <span class="crewArrow">↳</span>
            <span class="crewRole">${roleNames[idx]}</span>
            <span class="crewEmpty">Vacío</span>
            ${canBoard ? `<button class="crewBtn boardBtn" data-pid="${player.id}">Embarcar</button>` : ''}
          `;
          if (canBoard)
            slotDiv.querySelector(".boardBtn").onclick = () =>
              ws.send(JSON.stringify({ type: "boardShip", targetId: player.id }));
        }
        playersDiv.appendChild(slotDiv);
      });
    }
  });

  // Artillero: ocultar selector de nave (está en la nave del piloto)
  const myPlayer = roomData.players[myId];
  const isGunner = !!(myPlayer && myPlayer.pilotingFor);
  document.getElementById("shipSelector").style.display = isGunner ? "none" : "";

  if (myPlayer && !isGunner) syncShipSelector(myPlayer.shipType || "fighter");
}

function syncShipSelector(type) {
  document.querySelectorAll(".shipCard").forEach(card => {
    card.classList.toggle("selected", card.dataset.type === type);
  });
}

// Ship card clicks → send to server (lobby y panel de muerte)
function handleShipCardClick(e) {
  const card = e.target.closest(".shipCard");
  if (!card) return;
  ws.send(JSON.stringify({ type: "selectShip", shipType: card.dataset.type }));
  syncShipSelector(card.dataset.type);
}
document.getElementById("shipCards").addEventListener("click", handleShipCardClick);
document.getElementById("deadShipCards").addEventListener("click", handleShipCardClick);

// Botón cambiar equipo desde el panel de muerte
document.getElementById("deadSwitchTeamBtn").addEventListener("click", () => {
  ws.send(JSON.stringify({ type: "switchTeam" }));
});

const deadPanel = document.getElementById("deadPanel");

function showDeadPanel() {
  deadPanel.classList.remove("hidden");
  const me = getMe();
  if (me) syncShipSelector(me.shipType || "fighter");
}

function hideDeadPanel() {
  deadPanel.classList.add("hidden");
}

// Las previews se dibujan en buildShipCards() al recibir el init del servidor

addEventListener("keydown", e => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;

  const key = e.key.toLowerCase();
  keys[key] = true;

  if (bindings.scan && key === bindings.scan) {
    const me = getMe();
    if (me && !me.dead) {
      scanUntil = performance.now() + 8000;
      pingEnemiesUntil = performance.now() + 2000;
      triggerPingEffect(me.x, me.y);
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
    ws.send(JSON.stringify({ type: "missile", targetId }));
    playMissileSound();
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
    if (meNow && meNow.dead && (meNow.respawnsLeft ?? 0) > 0) {
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
    ws.send(JSON.stringify({ type: "flare" }));
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
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
  keys[e.key.toLowerCase()] = false;

  if (e.key === "Tab") showScoreboard = false;
  if (e.key === "Delete" && sdState === "charging") cancelSd();
  if (bindings.shoot && e.key.toLowerCase() === bindings.shoot && beamHeld) releaseBeamCharge();
});

const CFG_RESPAWN_DELAY = 5; // debe coincidir con server config RESPAWN_DELAY

setInterval(() => {
  if (hud.classList.contains("hidden")) return;
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

  const WARNING_DIST = 1000;

  const leftDist = me.x;
  const rightDist = 6000 - me.x;
  const topDist = me.y;
  const bottomDist = 6000 - me.y;

  const leftX = worldToScreen(0, 0, camX, camY).x;
  const rightX = worldToScreen(6000, 0, camX, camY).x;
  const topY = worldToScreen(0, 0, camX, camY).y;
  const bottomY = worldToScreen(0, 6000, camX, camY).y;

  ctx.lineWidth = 4;

  if (leftDist < WARNING_DIST) {
    ctx.globalAlpha = 1 - leftDist / WARNING_DIST;

    ctx.beginPath();
    ctx.strokeStyle = "#ff4444";
    ctx.moveTo(leftX, 0);
    ctx.lineTo(leftX, canvas.height);
    ctx.stroke();
  }

  if (rightDist < WARNING_DIST) {
    ctx.globalAlpha = 1 - rightDist / WARNING_DIST;

    ctx.beginPath();
    ctx.strokeStyle = "#ff4444";
    ctx.moveTo(rightX, 0);
    ctx.lineTo(rightX, canvas.height);
    ctx.stroke();
  }

  if (topDist < WARNING_DIST) {
    ctx.globalAlpha = 1 - topDist / WARNING_DIST;

    ctx.beginPath();
    ctx.strokeStyle = "#ff4444";
    ctx.moveTo(0, topY);
    ctx.lineTo(canvas.width, topY);
    ctx.stroke();
  }

  if (bottomDist < WARNING_DIST) {
    ctx.globalAlpha = 1 - bottomDist / WARNING_DIST;

    ctx.beginPath();
    ctx.strokeStyle = "#ff4444";
    ctx.moveTo(0, bottomY);
    ctx.lineTo(canvas.width, bottomY);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
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
function seededRand(seed) {
  let s = (seed | 0) >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 | 0;
    return (s >>> 0) / 4294967296;
  };
}

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
    // Gradiente radial descentrado → sensación de volumen (como asteroides)
    const sR = shape.shieldR ?? 42;
    const isGreen = player.team === "green";
    const hiColor = isGreen ? "#99ffcc" : "#ff99aa";
    const midColor = isGreen ? "#00ff88" : "#ff3355";
    const loColor = isGreen ? "#003820" : "#220010";
    const grad = ctx.createRadialGradient(-sR * 0.28, -sR * 0.32, sR * 0.04,
      0, 0, sR * 0.9);
    grad.addColorStop(0, hiColor);
    grad.addColorStop(0.45, midColor);
    grad.addColorStop(1, loColor);
    ctx.fillStyle = grad;
  }
  ctx.fill();
  ctx.globalAlpha = 1;

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

  // ── EMP: chispas rojas envolviendo a la nave impactada por el rayo de la Capital
  const emp = player.emp ?? 0;
  if (!player.dead && emp > 0.01) {
    const R = shape.shieldR ?? 60;
    ctx.save();
    // Resplandor rojo
    ctx.globalAlpha = 0.10 + 0.25 * emp;
    const g = ctx.createRadialGradient(0, 0, R * 0.45, 0, 0, R * 1.3);
    g.addColorStop(0,   "#ffffff00");
    g.addColorStop(0.7, "#ff222266");
    g.addColorStop(1,   "#ffffff00");
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

  // ── Carga del rayo (Capital): efecto pequeño concentrado en la punta (proa)
  const charge = player.beamCharge ?? 0;
  if (!player.dead && player.shipType === "capital" && charge > 0.02) {
    const nose = shape.body[0];            // vértice frontal del casco
    const isGreen = player.team === "green";
    const col = isGreen ? "#00ff88" : "#ff3355";
    const hi  = isGreen ? "#aaffdd" : "#ffd0dd";
    const full = charge >= 0.99;
    const now = performance.now();
    const baseR = 6 + charge * 9;          // orbe pequeño que crece con la carga

    ctx.save();
    ctx.translate(nose[0], nose[1]);

    // Orbe de energía
    const pulse = full ? 0.7 + 0.3 * Math.sin(now / 45) : 1;
    const orbR = baseR * pulse;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, orbR);
    g.addColorStop(0,   "#ffffff");
    g.addColorStop(0.5, col);
    g.addColorStop(1,   "#ffffff00");
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

  // ── Target lock ring (always visible if targeted) ──
  if (player.id === targetId) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 28, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffff00";
    ctx.lineWidth = 2;
    ctx.stroke();
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
    ctx.restore();
  });
}


//MISILES
// ── Cover helpers ─────────────────────────────
// Distancia mínima de un punto al segmento A→B (igual que servidor)
function ptSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

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
  const readyBtn = document.getElementById("ready");

  readyBtn.disabled = uiState !== "inRoom";
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
const timerEl = document.getElementById("timer");
function updateTimer(secs) {
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

  document.getElementById("hp").textContent =
    Math.floor(ship.hp);

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
      : "LISTO";

  const inertiaEl = document.getElementById("inertiaMode");
  if (inertiaEl) {
    inertiaEl.textContent = inertiaDampActive ? "CPLD " : "DECOUPLED";
    inertiaEl.style.color = inertiaDampActive ? "#555" : "#8aa8b8";
  }

  const heatEl = document.getElementById("weaponHeatEl");
  if (heatEl) {
    const heatPct = Math.round(weaponHeat);
    if (heatPct === 0) {
      heatEl.textContent = "FRÍO";
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
        cdEl.textContent = "LISTO";
        cdEl.style.color = me.team === "green" ? "#00ff88" : "#ff5577";
      }
    }
  }

  const alive =
    Object.values(players)
      .filter(p => !p.dead)
      .length;

  document.getElementById("alive").textContent =
    "Vivos: " + alive;

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

  // Auto-clear target lock si el objetivo se esconde bajo cobertura de asteroide
  if (targetId) {
    const tgt = players[targetId];
    const mePl = players[myId];
    if (!tgt || tgt.dead ||
      (mePl && (isSheltered(tgt.x, tgt.y) || losBlocked(mePl.x, mePl.y, tgt.x, tgt.y)))) {
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

  if (me) {
    updateHUD(me);
    const pilot = me.pilotingFor ? players[me.pilotingFor] : null;
    setMissileWarning(!me.dead && !!(me.lockedByMissile || pilot?.lockedByMissile));

    if (me.dead) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 40px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("DESTRUIDO", canvas.width / 2, canvas.height / 2 - 30);
      const respawnsLeft = me.respawnsLeft ?? 0;
      if (respawnsLeft > 0) {
        const elapsed = clientDeadAt ? Date.now() - clientDeadAt : 99999;
        const remaining = Math.max(0, Math.ceil((CFG_RESPAWN_DELAY * 1000 - elapsed) / 1000));
        ctx.font = "15px 'Courier New', monospace";
        if (remaining > 0) {
          ctx.fillStyle = "#aaa";
          ctx.fillText(`Reapareciendo en ${remaining}s...`, canvas.width / 2, canvas.height / 2 + 16);
        } else {
          ctx.fillStyle = "#00ff88";
          ctx.fillText(`[R] Reaparecer · ${respawnsLeft} reapariciu(s)`, canvas.width / 2, canvas.height / 2 + 16);
        }
      } else {
        ctx.font = "13px 'Courier New', monospace";
        ctx.fillStyle = "#666";
        ctx.fillText("Sin vidas extra · Esperando resultado...", canvas.width / 2, canvas.height / 2 + 16);
      }
      ctx.textAlign = "left";
    }

    // Aviso de nave apagada por EMP
    if (!me.dead && me.empDisabled) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 26px 'Courier New', monospace";
      ctx.fillStyle = `rgba(255,70,90,${0.6 + 0.4 * Math.sin(performance.now() / 90)})`;
      ctx.fillText("⚡ SISTEMAS APAGADOS", canvas.width / 2, canvas.height / 2 - 70);
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
    const resultText = winner === "draw"
      ? "⬡ EMPATE"
      : "⬡ " + (winner === "green" ? "VICTORIA EQUIPO VERDE" : "VICTORIA EQUIPO ROJO");
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
    ctx.fillText("Mantén [DEL] para autodestruir...", cx, cy - 16);
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
    ctx.fillText("⚠  AUTODESTRUCCIÓN  ⚠", cx, cy - 62);
    ctx.fillStyle = "#ff2222";
    ctx.font = `bold ${70 + (5 - sdCountdown) * 4}px 'Courier New', monospace`;
    ctx.fillText(sdCountdown, cx, cy + 12);
    ctx.fillStyle = "#555";
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText("[DEL] para cancelar", cx, cy + 36);
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
      "[T] Chat",
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
      ctx.fillText("ESPECTADOR · " + (spec.name || "Pilot") + " · [TAB] cambiar", canvas.width / 2, canvas.height - 27);
      ctx.restore();
    }
  }

  if (mobiOpen) updateMobiglass();

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
    const rowH   = rem * 1.8;
    const titleH = rem * 3;
    const teamH  = rem * 1.6;
    const colH   = rem * 1.4;
  
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

loop();