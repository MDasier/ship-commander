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
  respawn: "r",
  chat: "t",
  scan: "c",
};

const BINDING_LABELS = {
  thrust: "Propulsión",
  reverse: "Retroceso",
  strafeLeft: "Strafe izquierda",
  strafeRight: "Strafe derecha",
  shoot: "Disparar (teclado)",
  missile: "Misil (teclado)",
  flare: "Bengala",
  respawn: "Reaparecer",
  chat: "Chat",
  scan: "Escaneo radar",
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
  },

  // Constellation Andromeda — fuselaje largo y estrecho, 4 motores en la popa
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
  },

  // RSI Paladin — forma de A: nariz → piernas diagonales → concavidades interiores → popa
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
function drawShipPreviews() {
  for (const [type, shape] of Object.entries(SHIP_SHAPES)) {
    const el = document.getElementById("prev-" + type);
    if (!el) continue;
    const pc = el.getContext("2d");
    const w = el.width, h = el.height;
    pc.clearRect(0, 0, w, h);
    pc.save();
    pc.translate(w / 2, h / 2);

    // Paladin: rotar 90° (es más alta que ancha); el resto auto-escala sin rotar
    const rotated = type === "gunship";
    if (rotated) pc.rotate(-Math.PI / 2);

    // Auto-escalar para que la silueta llene el canvas sin salirse
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

    // Engine glow mark
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

let myId = null;
let roomData = null;

let players = {};
let bullets = [];
let asteroids = [];

let targetId = null;
let missiles = [];
let flares = [];
let scanUntil = 0;

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

  const masterSlider = document.getElementById("volMaster");
  const masterVal = document.getElementById("volMasterVal");
  const musicSlider = document.getElementById("volMusic");
  const musicVal = document.getElementById("volMusicVal");

  const savedMaster = parseFloat(localStorage.getItem("vol_master") ?? "0.8");
  const savedMusic = parseFloat(localStorage.getItem("vol_music") ?? "0.5");

  masterSlider.value = savedMaster;
  masterVal.textContent = Math.round(savedMaster * 100) + "%";
  musicSlider.value = savedMusic;
  musicVal.textContent = Math.round(savedMusic * 100) + "%";

  masterSlider.addEventListener("input", () => {
    const v = parseFloat(masterSlider.value);
    masterVal.textContent = Math.round(v * 100) + "%";
    setMasterVolume(v);
    localStorage.setItem("vol_master", v);
  });

  musicSlider.addEventListener("input", () => {
    const v = parseFloat(musicSlider.value);
    musicVal.textContent = Math.round(v * 100) + "%";
    setMusicVolume(v);
    localStorage.setItem("vol_music", v);
  });

  document.getElementById("openAdminBtn").addEventListener("click", () => {
    window.open("http://" + location.hostname + ":8081", "_blank");
  });
}

function applyStoredVolumes() {
  const master = parseFloat(localStorage.getItem("vol_master") ?? "0.8");
  const music = parseFloat(localStorage.getItem("vol_music") ?? "0.5");
  setMasterVolume(master);
  setMusicVolume(music);
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
  gameOverEl.classList.remove("hidden");
  const isHost = roomData && roomData.ownerId === myId;
  restartBtn.classList.toggle("hidden", !isHost);
  const hostHint = document.getElementById("gameOverHostHint");
  const guestHint = document.getElementById("gameOverGuestHint");
  if (hostHint) hostHint.classList.toggle("hidden", !isHost);
  if (guestHint) guestHint.classList.toggle("hidden", isHost);
  playVictorySound();
  stopMusic();
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
}

restartBtn.onclick = () => {
  ws.send(JSON.stringify({ type: "restartGame" }));
};

document.getElementById("backToLobby").onclick = () => {
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

canvas.addEventListener("contextmenu", e => e.preventDefault());

canvas.addEventListener("mousedown", e => {
  if (hud.classList.contains("hidden")) return;
  const me = getMe();
  if (!me || me.dead) return;
  if (e.button === 0) {
    ws.send(JSON.stringify({ type: "shoot" }));
    playShootSound();
  } else if (e.button === 2) {
    if (targetId && players[targetId] && !players[targetId].dead) {
      ws.send(JSON.stringify({ type: "missile", targetId }));
      playMissileSound();
    } else {
      cycleTargetByRadar();
    }
  }
});

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

document.getElementById("ready").onclick = () => {
  if (uiState !== "inRoom") return;
  ws.send(JSON.stringify({
    type: "ready"
  }));
};

document.getElementById("leaveRoom").onclick = () => {
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
        spawnExplosion(p.x, p.y, p.team);
        playExplosionSound();
        if (p.id === myId) { cancelSd(); clientDeadAt = Date.now(); }
        const myP = players[myId];
        if (myP) {
          const dist = Math.hypot(p.x - myP.x, p.y - myP.y);
          shakeMag = Math.max(shakeMag, Math.max(0, (500 - dist) / 500) * 14);
        }
      }
      // Detectar respawn (dead → alive)
      if (!p.dead && deadIds.has(p.id)) {
        deadIds.delete(p.id);
        if (p.id === myId) clientDeadAt = null;
      }
    });

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

    let statusText = playing ? "EN PARTIDA" : "EN ESPERA";
    if (playing && room.allowJoinMidGame) statusText = "EN PARTIDA · ABIERTA";

    div.innerHTML = `
      <span class="roomId">#${room.id.slice(0, 6)}</span>
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
const SHIP_LABELS = { interceptor: "RAZOR", fighter: "GLADIUS", bomber: "ANDRMD", gunship: "PALADIN" };

function speedRating(mult) {
  if (mult >= 1.4) return "+++";
  if (mult >= 0.9) return "++";
  if (mult >= 0.5) return "+";
  return "−−−";
}

function radarRating(sig) {
  if (sig >= 3000) return "+++";   // muy visible
  if (sig >= 1500) return "++";
  if (sig >= 800)  return "+";
  return "−−";                     // firma baja = difícil de detectar
}

function buildShipCards(ships) {
  for (const [type, ship] of Object.entries(ships)) {
    const words = (ship.label || type).split(" ");
    SHIP_LABELS[type] = words[words.length - 1].toUpperCase().slice(0, 7);
  }

  const vals = Object.values(ships);
  const maxHp    = Math.max(...vals.map(s => s.maxHp));
  const maxSpeed = Math.max(...vals.map(s => s.thrustMult));
  const maxMsl   = Math.max(...vals.map(s => s.maxMissiles));
  const maxRadar = Math.max(...vals.map(s => s.radarSignature));

  function segs(value, max, invert = false, n = 10) {
    const filled = Math.round((value / max) * n);
    const active = invert ? n - filled : filled;
    return Array.from({ length: n }, (_, i) =>
      `<i class="ss ${i < active ? 'a' : ''}"></i>`
    ).join('');
  }

  const container = document.getElementById("shipCards");
  container.innerHTML = "";

  for (const [type, ship] of Object.entries(ships)) {
    const btn = document.createElement("button");
    btn.className = "shipCard" + (type === "fighter" ? " selected" : "");
    btn.dataset.type = type;

    const mslDisplay = ship.crewCapacity > 1 ? `${ship.maxMissiles}+20` : ship.maxMissiles;
    const velDisplay  = Math.round(ship.thrustMult * 100) + "%";

    btn.innerHTML = `
      <canvas class="shipPreview" id="prev-${type}" width="90" height="54"></canvas>
      <div class="shipCardName">${ship.label || type.toUpperCase()}</div>
      <div class="shipStats">
        <div class="sRow"><span class="sLbl">HP</span><div class="sBar">${segs(ship.maxHp, maxHp)}</div><span class="sVal">${ship.maxHp}</span></div>
        <div class="sRow"><span class="sLbl">VEL</span><div class="sBar">${segs(ship.thrustMult, maxSpeed)}</div><span class="sVal">${velDisplay}</span></div>
        <div class="sRow"><span class="sLbl">MSL</span><div class="sBar">${segs(ship.maxMissiles, maxMsl)}</div><span class="sVal">${mslDisplay}</span></div>
        <div class="sRow"><span class="sLbl">SIG</span><div class="sBar">${segs(ship.radarSignature, maxRadar)}</div><span class="sVal">${ship.radarSignature}</span></div>
      </div>
      <div class="shipCardDesc">${ship.desc || ""}</div>
    `;

    container.appendChild(btn);
  }

  drawShipPreviews();
}

function renderPlayers() {
  if (!roomData) return;

  playersDiv.innerHTML = "";

  // Toggle mid-game join (solo visible al host)
  if (roomData.ownerId === myId) {
    const hostBar = document.createElement("div");
    hostBar.id = "hostBar";
    const mjOn = roomData.allowJoinMidGame;
    hostBar.innerHTML = `
      <span class="hostBarLabel">Unirse en partida</span>
      <button id="toggleMidGameJoin" class="hostToggleBtn ${mjOn ? 'on' : ''}">
        ${mjOn ? 'Activado' : 'Desactivado'}
      </button>
    `;
    hostBar.querySelector("#toggleMidGameJoin").onclick = () => {
      ws.send(JSON.stringify({ type: "toggleMidGameJoin" }));
    };
    playersDiv.appendChild(hostBar);
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

    // Slot de tripulación para naves Capital
    if (player.shipType === "gunship") {
      const slotDiv = document.createElement("div");
      slotDiv.className = "crewSlot";
      const gunner = player.gunnerId ? roomData.players[player.gunnerId] : null;
      const myP = roomData.players[myId];
      const amGunnerElsewhere = myP && !!myP.pilotingFor;
      const iAmPilot = player.id === myId;

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
        if (canBoard) {
          slotDiv.querySelector(".boardBtn").onclick = () =>
            ws.send(JSON.stringify({ type: "boardShip", targetId: player.id }));
        }
      }
      playersDiv.appendChild(slotDiv);
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

// Ship card clicks → send to server
document.getElementById("shipCards").addEventListener("click", e => {
  const card = e.target.closest(".shipCard");
  if (!card) return;
  ws.send(JSON.stringify({ type: "selectShip", shipType: card.dataset.type }));
  syncShipSelector(card.dataset.type);
});

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
      triggerPingEffect(me.x, me.y);
    }
  }

  // Fallback teclado: shoot / missile
  if (bindings.shoot && key === bindings.shoot) {
    ws.send(JSON.stringify({ type: "shoot" }));
    playShootSound();
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

  if (bindings.chat && key === bindings.chat && !chatInputOpen) {
    e.preventDefault();
    const meNow = getMe();
    if (meNow && !meNow.dead) openChat();
  }

  if (bindings.flare && key === bindings.flare) {
    ws.send(JSON.stringify({ type: "flare" }));
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
});

const CFG_RESPAWN_DELAY = 5; // debe coincidir con server config RESPAWN_DELAY

setInterval(() => {
  if (hud.classList.contains("hidden")) return;
  const me = getMe();
  if (!me || me.dead) return;
  const targetAngle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
  ws.send(JSON.stringify({
    type: "input",
    thrust: !!(bindings.thrust && keys[bindings.thrust]),
    reverse: !!(bindings.reverse && keys[bindings.reverse]),
    strafeLeft: !!(bindings.strafeLeft && keys[bindings.strafeLeft]),
    strafeRight: !!(bindings.strafeRight && keys[bindings.strafeRight]),
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
    const jitter    = (rand() - 0.5) * (Math.PI * 2 / numPts) * 0.55;
    const r         = ast.r * (0.52 + rand() * 0.48);
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
    ctx.shadowBlur  = 16;
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
  grad.addColorStop(0,    pal.hi);
  grad.addColorStop(0.55, pal.fill);
  grad.addColorStop(1,    pal.lo);
  ctx.fillStyle = grad;
  ctx.fill();

  // Apagar sombra para el trazo
  ctx.shadowColor    = 'transparent';
  ctx.shadowBlur     = 0;
  ctx.shadowOffsetX  = 0;
  ctx.shadowOffsetY  = 0;

  ctx.strokeStyle = isBelow ? '#1c1c1c' : isAbove ? '#585858' : pal.stroke;
  ctx.lineWidth   = isAbove ? 1.2 : isBelow ? 0.5 : 0.8;
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

  ctx.beginPath();
  buildShipPath(ctx, player.shipType);

  if (player.dead) {
    ctx.fillStyle = "#444";
  } else {
    ctx.fillStyle = player.team === "green" ? "#00ff88" : "#ff3355";
  }
  ctx.fill();

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

  // ── Torreta del Capital (independiente del ángulo del casco)
  if (player.shipType === "gunship" && !player.dead) {
    const hasGunner = !!player.gunnerId;
    const tAngle = player.turretAngle ?? 0;
    const tColor = player.team === "green" ? "#00ff88" : "#ff3355";
    ctx.save();
    ctx.translate(pos.x, pos.y);
    // Base de la torreta
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    ctx.strokeStyle = hasGunner ? tColor : "#333";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Cañón de la torreta
    ctx.rotate(tAngle);
    ctx.fillStyle = hasGunner ? tColor : "#2a2a2a";
    ctx.fillRect(4, -3.5, 28, 7);
    ctx.restore();
  }

  // ── HUD elements (only if detected) ───────────
  if (!player.dead && detected) {
    const hw = shape.hpBarW;
    const offY = shape.uiOffY;   // negative = above ship

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

    // Callsign
    ctx.save();
    ctx.fillStyle = player.id === myId ? "#00ccff" : "rgba(255,255,255,0.6)";
    ctx.font = "11px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(player.name || "Pilot", pos.x, pos.y + offY - 6);
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


//MISILES
function radarVisibleEnemies() {
  const me = players[myId];
  if (!me) return [];
  return Object.values(players).filter(p =>
    !p.dead && p.team !== me.team && !p.pilotingFor &&
    Math.hypot(p.x - me.x, p.y - me.y) <= (p.radarSignature || 450)
  );
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
  targetId = enemies[(idx + 1) % enemies.length].id;
}
function drawMissiles(camX, camY) {

  missiles.forEach(m => {

    const pos = worldToScreen(m.x, m.y, camX, camY);
    const angle = Math.atan2(m.vy, m.vx);

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    // Exhaust glow
    const grad = ctx.createRadialGradient(-7, 0, 0, -7, 0, 9);
    grad.addColorStop(0, "rgba(255,120,0,0.85)");
    grad.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(-6, 0, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = "#ffcc44";
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

    // Enemigos solo visibles dentro de su firma radar
    if (me && p.team !== me.team) {
      const dist = Math.hypot(p.x - me.x, p.y - me.y);
      if (dist > (p.radarSignature || 450)) return;
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

  // Background
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStars(ctx, camX, camY);

  if (me) drawWarningOverlay(me);

  drawWorldBounds(camX, camY);
  drawGrid(camX, camY);
  drawAsteroids(camX, camY, false); // z=0 y z=-1 (debajo de las naves)

  Object.values(players).forEach(p => drawVelocityVector(p, camX, camY));
  Object.values(players).forEach(p => drawShip(p, camX, camY));

  drawParticles(ctx, camX, camY);
  drawBullets(camX, camY);
  drawMissiles(camX, camY);
  drawFlares(camX, camY);

  drawAsteroids(camX, camY, true);  // z=1 (por encima de las naves)

  drawpingEffect(camX, camY);

  drawRadar();

  if (me) {
    updateHUD(me);
    const pilot = me.pilotingFor ? players[me.pilotingFor] : null;
    setMissileWarning(!!(me.lockedByMissile || pilot?.lockedByMissile));

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
  }

  if (winner) {

    if (winner !== prevWinner) {
      prevWinner = winner;
      setTimeout(showGameOver, 2500);
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

    const sorted = Object.values(players).sort((a, b) => (b.kills || 0) - (a.kills || 0));

    ctx.font = "12px 'Courier New', monospace";
    ctx.fillStyle = "#444";
    ctx.fillText("─────────────────────────────────────", cx, cy - 48);
    ctx.fillStyle = "#555";
    ctx.fillText("NOMBRE                    K      D", cx, cy - 32);

    sorted.forEach((p, i) => {
      ctx.fillStyle = p.team === "green" ? "#00ff88" : "#ff3355";
      const name = (p.name || "Pilot").slice(0, 16).padEnd(16);
      const me_marker = p.id === myId ? " ◄" : "";
      ctx.fillText(
        name + "          " + String(p.kills || 0).padStart(2) + "     " + String(p.deaths || 0).padStart(2) + me_marker,
        cx,
        cy - 6 + i * 26
      );
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
  if (showScoreboard && !winner) {
    const cx = canvas.width / 2;
    const bw = 460, bh = 60 + Object.keys(players).length * 26 + 20;
    const bx = cx - bw / 2, by = 60;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "#00ccff44";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.textAlign = "center";
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillStyle = "#00ccff";
    ctx.fillText("MARCADOR", cx, by + 22);
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillStyle = "#444";
    ctx.fillText("PILOTO                  K   D  NAVE", cx, by + 42);

    const sorted = Object.values(players).sort((a, b) => (b.kills || 0) - (a.kills || 0));
    sorted.forEach((p, i) => {
      const color = p.dead ? "#555" : p.team === "green" ? "#00ff88" : "#ff3355";
      ctx.fillStyle = color;
      const name = (p.name || "Pilot").slice(0, 14).padEnd(14);
      const kd = String(p.kills || 0).padStart(3) + String(p.deaths || 0).padStart(4);
      const ship = (p.shipType || "?").slice(0, 3).toUpperCase();
      const me_marker = p.id === myId ? " ◄" : "";
      ctx.fillText(name + "         " + kd + "  " + ship + me_marker, cx, by + 62 + i * 26);
    });
    ctx.restore();
  }

  requestAnimationFrame(loop);

}

loop();