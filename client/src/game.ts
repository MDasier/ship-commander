// @ts-nocheck
// Entry / orquestador del cliente. Tras la modularización (state, net, input,
// controls, actions, render/*), aquí queda el cableado, el manejador de mensajes
// (ws.onmessage), el puente de getters/acciones para React y algunos helpers de
// menú/sala/nave. Mantiene @ts-nocheck: el cuerpo restante usa shapes laxos del
// dominio (Object.values sobre `S.players` → unknown, params implícitos) y
// tiparlo aportaría poco; la red de seguridad son los MÓDULOS tipados que SÍ
// chequea tsc. Los módulos extraídos NO llevan @ts-nocheck (salvo render/*, que
// es canvas legacy). Verificado: quitar el pragma deja 56 errores solo de tipado
// (no de correctitud); la extracción ya destapó y arregló los orphans reales.
// ── Módulos del cliente (ES modules · empaquetados por Vite) ──
import "./styles.css";
import { applyI18n, onLangChange, setLang } from "./i18n.js";
import { spawnExplosion, spawnBeamImpact } from "./particles.js";
import {
  getBindings, rebindKey, resetBindings, onBindingsChange,
  displayKey, bindingText, renderControlesPane, cancelRecording,
} from "./game/controls";
import {
  initAudio, startMusic, stopMusic, resetAudio,
  playEmpSound, playExplosionSound, playVictorySound,
} from "./sounds.js";
import { drawShipPreview } from "./game/shapes";
import {
  DEFAULT_BINDINGS, BINDING_LABELS, RESERVED_KEYS,
  SUPPORT_URL, MENU_SCREENS, REACT_SCREENS,
} from "./game/constants";
import { clearKeys, installInput } from "./game/input";
import {
  applyStoredVolumes, getAudioSettings,
  setAudioEffects, setAudioMusic, setAudioTrack, setAudioMuted,
} from "./game/audio";
import { S } from "./game/state";
import { ws } from "./game/net";
import { canvas, getMe } from "./game/render/canvas";
import {
  initRender, startRenderLoop, clearAsteroidCache,
  updateUI, updateTimer,
} from "./game/render/draw";
import { cycleTargetByRadar } from "./game/render/sensors";
import { triggerPingEffect } from "./game/render/world";
import {
  fireWeapon, stopAutoFire, isCapitalPilot,
  startBeamCharge, releaseBeamCharge, cycleSpectator,
  startSdCharge, cancelSd,
} from "./game/actions";

// Controles/keybindings (getBindings, rebindKey, bindingText, renderControlesPane…)
// viven en game/controls.ts.


// triggerPingEffect (+ su cola) vive en game/render/world.ts.

// canvas/ctx/worldToScreen/getMe viven en game/render/canvas.ts (tamaño + resize).

// El socket del juego + reconexión automática viven en game/net.ts. game.ts solo
// le cuelga el manejador de mensajes (ws.onmessage), acoplado a sus funciones.

// Estado de juego centralizado en game/state.ts (objeto mutable `S`).
// La interpolación cliente y el render loop viven en game/render/.



// `keys` y `clearKeys` (estado de teclas) viven en game/input.ts; el render loop
// y openChat/returnToLobby los consumen importados.

const menu = document.getElementById("menu");

// El HUD vive en React (Hud.tsx), montado en la ruta /game. Sustituimos el
// antiguo flag visual (#hud.hidden) por un estado de juego explícito que los
// guards de input consultan; React monta/desmonta el HUD por ruta.
// (S.inGame)

// ── Mobiglass
// Pestañas, botón de cierre y click-fuera del MobiGlass los gestiona React
// (MobiGlass.tsx). game.js solo emite el evento "mobi" en open/closeMobiglass.
// (S.mobiOpen)

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
// S.mobiOpen (consultado por F1 y el cierre en game over) y avisan a React por
// evento; el render del overlay lo hace el componente.
function openMobiglass() {
  const me = getMe();
  if (!me) return;
  S.mobiOpen = true;
  window.dispatchEvent(new CustomEvent("mobi", { detail: true }));
}
function closeMobiglass() {
  cancelRecording();
  S.mobiOpen = false;
  window.dispatchEvent(new CustomEvent("mobi", { detail: false }));
}
// Estado de jugadores (puente para React: paneles Piloto/Partida del MobiGlass).
function getPlayers() { return S.players; }


// ── Game Over
// Game Over migrado a React (GameOver.tsx): el texto VICTORIA/DERROTA + marcador
// se siguen dibujando en el canvas; React solo monta las pistas host/invitado y
// los botones (reiniciar / volver al lobby), vía el evento "gameover".
function showGameOver() {
  if (S.uiState !== "inRoom") return;
  if (!S.winner) return;
  const isHost = !!(S.roomData && S.roomData.ownerId === S.myId);
  playVictorySound();
  stopMusic();
  hideDeadPanel();
  window.dispatchEvent(new CustomEvent("gameover", { detail: { show: true, isHost, solo: S.soloMode } }));
}

function hideGameOver() {
  window.dispatchEvent(new CustomEvent("gameover", { detail: { show: false } }));
}

// Acción de reinicio (host) desde el game over React.
function gameRestart() { ws.send(JSON.stringify({ type: "restartGame" })); }

function resetClientState() {
  S.players = {}; S.bullets = []; S.missiles = []; S.asteroids = [];
  S.flares = []; S.winner = null; S.prevWinner = null; S.targetId = null;
  S.stateBuffer = [];
  S.specTargetId = null; S.deadIds = new Set(); S.killFeed = []; S.chatLog = [];
  S.shakeMag = 0;
  clearAsteroidCache();
  cancelSd();
  hideDeadPanel();
  S.soloMode = false; S.waveMode = false; S.waveNum = 0; S.enemiesLeft = 0; S.waveBanner = null; S.teamLives = null;
}

// Vuelve al lobby desde cualquier estado (game over, partida en curso o muerto).
// Centraliza toda la limpieza para que no haya estados a medias ("doble salida").
function returnToLobby() {
  clearTimeout(S.gameOverTimer);
  S.gameOverTimer = null;
  S.winner = null;
  S.prevWinner = null;

  ws.send(JSON.stringify({ type: "leaveRoom" }));
  resetClientState();          // limpia S.winner/S.prevWinner, S.players, target, etc.
  S.uiState = "lobby";
  S.currentRoomId = null;
  S.roomData = null;

  resetAudio();
  hideGameOver();
  hideDeadPanel();
  closeMobiglass();
  closeChat();
  menu.style.display = "";
  S.inGame = false;
  showMenuScreen("mainMenu");   // volver al hub principal
  updateUI();
}

// ── Chat ── migrado a React (ChatInput.tsx): el LOG se dibuja en el canvas;
// React solo monta el input al abrir. S.chatInputOpen sigue aquí (puerta del input
// de juego). openChat/closeChat emiten "chat"; chatSend envía y cierra.
// (S.chatInputOpen)

function openChat() {
  S.chatInputOpen = true;
  clearKeys();   // suelta el movimiento al empezar a escribir
  window.dispatchEvent(new CustomEvent("chat", { detail: true }));
}

function closeChat() {
  S.chatInputOpen = false;
  window.dispatchEvent(new CustomEvent("chat", { detail: false }));
}

function chatSend(text) {
  const t = (text || "").trim();
  if (t) ws.send(JSON.stringify({ type: "chat", text: t }));
  closeChat();
}

// Listeners de ratón/teclado registrados por game/input.ts (installInput).

// Acciones de combate (disparo/calor, rayo Capital, espectador, autodestrucción)
// viven en game/actions.ts.

// ── Nombre del jugador ──────────────────────────────────────────────
// Migrado a React (MainMenu): game.js ya no depende del DOM #nameInput.
// El nombre vive en `S.playerName` + localStorage y se sincroniza vía GameAPI.
S.playerName = (localStorage.getItem("spacetactics_name") || "").trim();

function applyName(name) {
  if (name != null) S.playerName = String(name).trim();
  if (!S.playerName) S.playerName = "Pilot";
  localStorage.setItem("spacetactics_name", S.playerName);
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "setName", name: S.playerName }));
  }
  return S.playerName;
}

// Valida que haya un nombre escrito (el menú React lo exige antes de COOP).
function requireName() {
  if (!S.playerName.trim()) return false;
  applyName();
  return true;
}

// Getters/setters para la UI React.
function getPlayerName() { return S.playerName; }
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
function getRoomData() { return S.roomData; }
function getMyId() { return S.myId; }
function roomToggleReady() { if (S.uiState === "inRoom") roomSend({ type: "ready" }); }
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
    S.myId = data.id;
    if (data.ships) buildShipCards(data.ships);
    applyName();
  }

  if (data.type === "rooms") {
    renderRooms(data.rooms);
  }

  if (data.type === "roomJoined") {

    S.currentRoomId = data.roomId;
    S.uiState = "inRoom";

    showMenuScreen("room");
    updateUI();
  }

  if (data.type === "roomUpdate") {
    S.roomData = data.room;
    renderPlayers();
  }

  if (data.type === "balanceError") {
    // La sala vive en React (Room.tsx): le pasamos el aviso de desequilibrio.
    window.dispatchEvent(new CustomEvent("room-error", { detail: { green: data.green, red: data.red } }));
  }

  if (data.type === "gameStarted") {

    menu.style.display = "none";
    S.inGame = true;
    // Desmonta cualquier overlay de menú React (p. ej. FlySolo) al entrar en juego.
    window.dispatchEvent(new CustomEvent("menu-screen", { detail: "game" }));
    S.deadIds = new Set();
    startMusic();

  }

  if (data.type === "chat") {
    S.chatLog.push({ name: data.name, team: data.team, text: data.text, ts: Date.now() });
    if (S.chatLog.length > 8) S.chatLog.shift();
  }

  if (data.type === "roomRestarted") {

    clearTimeout(S.gameOverTimer);
    S.gameOverTimer = null;
    S.winner = null;
    S.prevWinner = null;

    resetClientState();
    S.roomData = data.room;
    S.uiState = "inRoom";
    S.currentRoomId = data.room.id;
    hideGameOver();
    closeMobiglass();
    S.inGame = false;
    menu.style.display = "";
    showMenuScreen("room");
    renderPlayers();
    resetAudio();
    updateUI();
  }

  if (data.type === "state") {
    // Ignorar estados tardíos que llegan tras salir de la sala: el servidor sigue
    // emitiendo a 60fps hasta procesar el leaveRoom y esos frames re-asignaban
    // `S.winner`, reprogramando el game over (bug de "doble salida" al lobby).
    if (S.uiState !== "inRoom") return;

    const incoming = data.players || {};

    // Detect newly dead → explosion + shake
    Object.values(incoming).forEach(p => {
      if (p.dead && !S.deadIds.has(p.id)) {
        S.deadIds.add(p.id);
        // Artillero dentro de una nave: no generar explosión separada (ya la genera el piloto)
        if (!p.pilotingFor) {
          spawnExplosion(p.x, p.y, p.team);
          playExplosionSound();
          const myP = S.players[S.myId];
          if (myP) {
            const dist = Math.hypot(p.x - myP.x, p.y - myP.y);
            S.shakeMag = Math.max(S.shakeMag, Math.max(0, (500 - dist) / 500) * 14);
          }
        }
        if (p.id === S.myId) { cancelSd(); S.clientDeadAt = Date.now(); S.targetId = null; }
      }
      // Detectar respawn (dead → alive)
      if (!p.dead && S.deadIds.has(p.id)) {
        S.deadIds.delete(p.id);
        if (p.id === S.myId) { S.clientDeadAt = null; hideDeadPanel(); }
      }
    });

    // Mostrar/ocultar panel de nave al morir
    const myIncoming = incoming[S.myId];
    const myWasDead = S.players[S.myId]?.dead;
    if (myIncoming && myIncoming.dead && !myWasDead) showDeadPanel();
    if (myIncoming && !myIncoming.dead && myWasDead) hideDeadPanel();

    // Detect damage taken → shake
    const myPrev = S.players[S.myId];
    const myNext = incoming[S.myId];
    if (myPrev && myNext && myNext.hp < myPrev.hp && myNext.hp > 0) {
      S.shakeMag = Math.max(S.shakeMag, (myPrev.hp - myNext.hp) * 0.45);
    }

    // Push to interpolation buffer — positions are applied each RAF frame
    S.stateBuffer.push({
      time: Date.now(),
      players: incoming,
      bullets: data.bullets || [],
      missiles: data.missiles || [],
      flares: data.flare || [],
    });

    // Non-interpolated state: apply immediately
    S.beams = data.beams || [];
    // Burst de impacto (partículas) solo al aparecer un beam nuevo que ha golpeado
    const seenBeams = new Set();
    S.beams.forEach(b => {
      seenBeams.add(b.id);
      if (b.hit && !S.prevBeamIds.has(b.id)) spawnBeamImpact(b.x2, b.y2, b.team);
    });
    S.prevBeamIds = seenBeams;
    S.empPulses = data.empPulses || [];
    S.mines = data.mines || [];
    // Sonido al aparecer una onda EMP / explosión de mina nueva
    const seen = new Set();
    S.empPulses.forEach(e => {
      seen.add(e.id);
      if (!S.prevPulseIds.has(e.id)) {
        if (e.blast) playExplosionSound(); else playEmpSound();
      }
    });
    S.prevPulseIds = seen;
    S.asteroids = data.asteroids || [];
    S.world = data.world || S.world;
    S.winner = data.winner;
    S.killFeed = data.killFeed || [];
    updateTimer(data.timeLeft);

    // Modo oleadas (solo práctica)
    S.soloMode = !!data.solo;
    S.waveMode = !!data.waveMode;
    S.teamLives = (data.teamLives === undefined ? null : data.teamLives);
    S.waveNum = data.wave || 0;
    S.waveTotal = data.waveTotal || 0;
    S.enemiesLeft = data.enemiesLeft || 0;
    if (data.waveBanner) {
      const sig = data.waveBanner.key + "|" + data.waveBanner.n;
      if (sig !== S.waveBannerSig) {
        S.waveBanner = data.waveBanner;       // { key, n }
        S.waveBannerSig = sig;
        S.waveBannerShownAt = Date.now();
      }
    } else {
      S.waveBanner = null;
      S.waveBannerSig = null;
    }
  }

};

// La lista de salas está migrada a React (CoopRooms.tsx). Guardamos el último
// listado del servidor y avisamos a React; el render lo hace el componente.
function getRoomList() { return S.roomList; }
function renderRooms(list) {
  S.roomList = Array.isArray(list) ? list : [];
  window.dispatchEvent(new CustomEvent("rooms-update"));
}
// Etiquetas cortas para la lista de jugadores — se actualizan dinámicamente
const SHIP_LABELS = { interceptor: "INTERCEPTOR", fighter: "L.FIGHTER", bomber: "BOMBER", gunship: "GUNSHIP" };

// Metadatos de nave que envía el servidor en el init. Se exponen a React
// (getShips + evento "ships-init") para que las pantallas React (Vuela Solo,
// y más adelante Lobby) rendericen sus tarjetas con los stats reales.
function getShips() { return S.shipMeta; }

function buildShipCards(ships) {
  S.shipMeta = ships;
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
  const me = S.players[S.myId];
  if (!me) return [];
  const myReservedPilot = me.pilotingFor || null;
  const entries = [];
  Object.values(S.players).forEach(p => {
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

// (handlers de teclado + envio de input ~30/s en game/input.ts)

//LIMITES Y GRID DEL MAPA

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

// Registra los listeners de input (teclado/ratón) inyectando las funciones del
// motor que necesitan. Se hace aquí, al final, cuando ya están todas definidas.
installInput({
  canvas,
  getBindings,
  getSdState: () => S.sdState,
  getMe,
  isCapitalPilot,
  fireWeapon,
  stopAutoFire,
  startBeamCharge,
  releaseBeamCharge,
  cycleTargetByRadar,
  cycleSpectator,
  triggerPingEffect,
  openChat,
  openMobiglass,
  closeMobiglass,
  cancelSd,
  startSdCharge,
});

// Inyecta en el render loop las funciones del motor que necesita (bindings,
// paneles de muerte/game over) y arranca el bucle de animación.
initRender({
  getBindings,
  bindingText,
  setDeadPanelVisible,
  showGameOver,
  closeMobiglass,
});

startRenderLoop();