// ─────────────────────────────────────────────────────────────
// i18n — Español (España) / English. Selección del usuario.
// Uso:
//   t("menu.playOnline")              → texto traducido
//   t("game.respawnIn", { n: 3 })     → con variables {n}
//   applyI18n()                       → aplica a [data-i18n] del DOM
//   setLang("en")                     → cambia idioma y reaplica
// Los textos con teclas de control se componen en game.js usando
// bindingText() (la variable local del usuario), no aquí.

/**
 * ¿Qué significa i18n ?
 * Proviene de internationalization(internacionalización).
 * Se escribe así porque:
 * La palabra empieza por i
 * Termina por n
 * Entre ambas hay 18 letras
 * i + 18 letras + n = i18n
 * De la misma forma existen otras abreviaturas comunes:
 * l10n = localization(localización)
 * a11y = accessibility(accesibilidad)
 */
// ─────────────────────────────────────────────────────────────

const I18N = {
  es: {
    // Común
    "common.save": "Guardar",
    "common.backMenu": "Menú",
    "common.leave": "Salir",
    "common.ready": "LISTO",
    "common.recommended": "Recom.",
    "common.lang": "Idioma",

    // Menú principal
    "menu.tag": "Tag",
    "menu.namePlaceholder": "Escribe tu nombre...",
    "menu.saved": "✓ Guardado",
    "menu.subtitle": "COMBATE ESPACIAL MULTIJUGADOR",
    "menu.tagHelp": "Tu nombre de piloto. Visible para el resto de jugadores.",
    "menu.playOnline": "CO-OP",
    "menu.solo": "VUELA SÓLO",
    "menu.controls": "VER CONTROLES",
    "menu.support": "APOYA EL PROYECTO",
    "menu.coopSub": "Crea o únete a una sala",
    "menu.soloSub": "Practica contra IA o vuelo libre",
    "menu.controlsSub": "Mapa de teclas y ayudas",
    "menu.supportSub": "Invítanos a un café",

    // Lobby
    "lobby.create": "Crear sala",
    "lobby.refresh": "Actualizar lista",
    "lobby.title": "Salas disponibles",
    "lobby.hint": "Crea una sala o únete a una existente para empezar.",
    "lobby.empty": "No hay salas. ¡Crea una!",
    "lobby.join": "Unirse",
    "lobby.playing": "En partida",
    "lobby.waiting": "En espera",
    "lobby.open": "Abierta",

    // Solo / práctica
    "solo.title": "Vuela sólo",
    "solo.mode": "MODO",
    "solo.waves": "Oleadas",
    "solo.free": "Vuelo libre",
    "solo.duration": "DURACIÓN",
    "solo.min": "min",
    "solo.noLimit": "Sin límite",
    "solo.size": "TAMAÑO DEL ESCENARIO",
    "solo.ship": "NAVE",
    "solo.start": "▶ EMPEZAR PRÁCTICA",
    "solo.hint": "Vuela libre para practicar controles y armas. Sal con [F1] → Salir al lobby.",

    // Controles
    "controls.title": "Controles",
    "controls.change": "Cambiar",
    "controls.reset": "Restaurar por defecto",
    "controls.fixed": "FIJOS",
    "controls.thrust": "Propulsión",
    "controls.reverse": "Retroceso",
    "controls.strafeLeft": "Strafe izquierda",
    "controls.strafeRight": "Strafe derecha",
    "controls.shoot": "Disparar (teclado)",
    "controls.missile": "Misil (teclado)",
    "controls.flare": "Bengala",
    "controls.special": "Habilidad especial (EMP / mina)",
    "controls.respawn": "Reaparecer",
    "controls.scan": "Escaneo radar",
    "controls.inertiaDamp": "Alternar inercia",
    "controls.brake": "Freno",
    "controls.fxAim": "Apuntar / girar",
    "controls.fxFire": "Disparar",
    "controls.fxLock": "Lockear / Misil",
    "controls.fxScore": "Marcador",
    "controls.fxMobi": "MobiGlass",
    "controls.fxSelfDestruct": "Autodestrucción",
    "controls.kbMouse": "Ratón",
    "controls.kbLClick": "Clic Izq.",
    "controls.kbRClick": "Clic Der.",
    "controls.kbTab": "Tab ⟨mantener⟩",

    // Sala (room)
    "room.title": "LOBBY",
    "room.hint": "Esperando jugadores...",
    "room.switchTeam": "Cambiar equipo",
    "room.ready": "Go",
    "room.readyOn": "✓ LISTO",
    "room.shipLabel": "NAVE DE COMBATE",
    "room.namePlaceholder": "Nombre de la sala...",
    "room.coopAI": "Co-op vs IA (oleadas)",
    "room.midGameJoin": "Unirse en partida",
    "room.balancedTeams": "Equipos equilibrados",
    "room.scenarioSize": "Tamaño del escenario",
    "room.section": "Sala",
    "room.squad": "Escuadrón",
    "room.teamGreen": "Equipo verde",
    "room.teamRed": "Equipo rojo",
    "room.aiWaves": "IA · OLEADAS",
    "room.gunner": "Artillero",
    "room.turret": "Torreta",
    "room.emptySlot": "Vacío",
    "room.board": "Embarcar",
    "room.leaveShip": "Salir",
    "room.you": "(tú)",
    "room.waitingShort": "ESPERA",
    "room.emptyTeam": "Sin pilotos aún",
    "room.unbalanced": "⚠ Desequilibrado — iguala los equipos para empezar",
    "room.sizeSmall": "Pequeño",
    "room.sizeMedium": "Medio",
    "room.sizeLarge": "Grande",
    "room.sizeHuge": "Enorme",
    "room.asteroids": "ast.",

    // HUD
    "hud.status": "ESTADO",
    "hud.hp": "HP",
    "hud.shield": "SHD",
    "hud.fuel": "Fuel",
    "hud.speed": "Vel",
    "hud.kd": "K/D",
    "hud.msl": "MSL",
    "hud.flares": "BENG",
    "hud.flight": "FLT",
    "hud.cannon": "CAÑÓN",
    "hud.cold": "FRÍO",
    "hud.coupled": "COPL",
    "hud.decoupled": "DCPL",
    "hud.alive": "Vivos: {n}",

    // Panel al morir
    "dead.selectShip": "SELECCIONAR NAVE",
    "dead.turret": "O ENTRA DE ARTILLERO",
    "dead.switchTeam": "⇄ Cambiar equipo",
    "dead.leave": "↩ Salir al lobby",
    "dead.reserved": "RESERVADA · [R] para entrar",
    "dead.freeTurrets": "{n} torreta(s) libre(s)",

    // MobiGlass
    "mobi.pilot": "PILOTO",
    "mobi.match": "PARTIDA",
    "mobi.controls": "CONTROLES",
    "mobi.settings": "AJUSTES",
    "settings.sound": "🔊 Sonido",
    "settings.volEffects": "VOLUMEN EFECTOS",
    "settings.volMusic": "VOLUMEN MÚSICA",
    "settings.musicTrack": "PISTA DE MÚSICA",
    "settings.trackA": "Pista A — Ambiental",
    "settings.trackB": "Pista B — Lo-Fi",
    "settings.language": "IDIOMA",

    // Game over
    "gameover.hostHint": "Eres el HOST · puedes reiniciar la partida para todos o volver al lobby",
    "gameover.guestHint": "Esperando a que el HOST reinicie... · puedes volver al lobby cuando quieras",
    "gameover.restart": "Reiniciar partida",
    "gameover.back": "↩ Volver al lobby",
    "gameover.victory": "VICTORIA",
    "gameover.defeat": "DERROTA",
    "gameover.draw": "EMPATE",

    // Chat
    "chat.placeholder": "Mensaje... (Enter enviar · Esc cancelar)",

    // Conexión
    "conn.reconnecting": "Reconectando",
    "conn.hint": "Se reconectará automáticamente en cuanto el servidor vuelva.",
    "conn.retry": "↻ Reintentar ahora",

    // Arranque / standby del servidor
    "boot.waking": "Conectando con el servidor...",
    "boot.cold": "El servidor estaba en reposo. Despertándolo, espera unos segundos...",
    "boot.retry": "Reintentando conexión...",

    // En juego
    "game.destroyed": "DESTRUIDO",
    "game.respawnIn": "Reapareciendo en {n}s...",
    "game.pressRespawn": "Pulsa [{key}] para reaparecer",
    "game.spectator": "ESPECTADOR · {name} · [TAB] cambiar",
    "game.noTeamLives": "Sin vidas de equipo · esperando el final de la partida",
    "game.systemsDown": "⚡ SISTEMAS APAGADOS",
    "game.selfDestructHold": "Mantén [{key}] para autodestruir...",
    "game.selfDestructWarn": "⚠  AUTODESTRUCCIÓN  ⚠",
    "game.selfDestructCancel": "[{key}] para cancelar",
    "game.teamLives": "VIDAS EQUIPO",
    "game.wave": "OLEADA {n}",
    "game.enemies": "Enemigos: {n}",
    "hud.waveLabel": "OLEADA {n}/{total}",
    "hud.preparing": "PREPARANDO...",
    "hud.enemiesShort": "ENEMIGOS",
    "game.respawnTurret": "Pulsa [{key}] para entrar en la torreta de {name}",
    "game.ally": "tu aliado",
    "game.teamLivesN": "Vidas de equipo: {n}",
    "game.respawnsInf": "Reapariciones: ∞",
    "game.chooseShip": "elige tu nave o torreta abajo",
    "game.chooseShipTurret": "o elige otra nave/torreta abajo",
    "hud.controlsLine": "[F1] MobiGlass · [Enter] Chat",

    // Banners de oleada (enviados por el servidor como clave)
    "wave.start": "OLEADA {n}",
    "wave.boss": "OLEADA {n} — ¡CAPITAL!",
    "wave.cleared": "OLEADA {n} SUPERADA",
    "wave.intermission": "Prepárate... Oleada {n}",
    "wave.complete": "¡PRÁCTICA COMPLETADA!",
    "wave.defeat": "DERROTA",

    // Avisos de voz (voz robótica femenina estilo SC)
    "voice.lowFuel": "Combustible bajo",
    "voice.shieldsDown": "Escudos caídos",
    "voice.hullCritical": "Casco crítico",

    // Resultado de partida
    "result.wavesWon": "✦ ¡OLEADAS SUPERADAS!",
    "result.wavesLost": "✖ HAS CAÍDO",
    "result.draw": "⬡ EMPATE",
    "result.greenWins": "⬡ VICTORIA EQUIPO VERDE",
    "result.redWins": "⬡ VICTORIA EQUIPO ROJO",
  },

  en: {
    "common.save": "Save",
    "common.backMenu": "Menu",
    "common.leave": "Leave",
    "common.ready": "READY",
    "common.recommended": "Rec.",
    "common.lang": "Language",

    "menu.tag": "Tag",
    "menu.namePlaceholder": "Type your name...",
    "menu.saved": "✓ Saved",
    "menu.subtitle": "MULTIPLAYER SPACE COMBAT",
    "menu.tagHelp": "Your pilot name. Visible to other players.",
    "menu.playOnline": "CO-OP",
    "menu.solo": "FLY SOLO",
    "menu.controls": "VIEW CONTROLS",
    "menu.support": "SUPPORT THE PROJECT",
    "menu.coopSub": "Create or join a room",
    "menu.soloSub": "Practice vs AI or free flight",
    "menu.controlsSub": "Key map and help",
    "menu.supportSub": "Buy us a coffee",

    "lobby.create": "Create room",
    "lobby.refresh": "Refresh list",
    "lobby.title": "Available rooms",
    "lobby.hint": "Create a room or join an existing one to start.",
    "lobby.empty": "No rooms. Create one!",
    "lobby.join": "Join",
    "lobby.playing": "In match",
    "lobby.waiting": "Waiting",
    "lobby.open": "Open",

    "solo.title": "Fly solo",
    "solo.mode": "MODE",
    "solo.waves": "Waves",
    "solo.free": "Free flight",
    "solo.duration": "DURATION",
    "solo.min": "min",
    "solo.noLimit": "No limit",
    "solo.size": "ARENA SIZE",
    "solo.ship": "SHIP",
    "solo.start": "▶ START PRACTICE",
    "solo.hint": "Free-fly to practice controls and weapons. Exit with [F1] → Leave to lobby.",

    "controls.title": "Controls",
    "controls.change": "Change",
    "controls.reset": "Restore defaults",
    "controls.fixed": "FIXED",
    "controls.thrust": "Thrust",
    "controls.reverse": "Reverse",
    "controls.strafeLeft": "Strafe left",
    "controls.strafeRight": "Strafe right",
    "controls.shoot": "Fire (keyboard)",
    "controls.missile": "Missile (keyboard)",
    "controls.flare": "Flare",
    "controls.special": "Special ability (EMP / mine)",
    "controls.respawn": "Respawn",
    "controls.scan": "Radar scan",
    "controls.inertiaDamp": "Toggle inertia",
    "controls.brake": "Brake",
    "controls.fxAim": "Aim / turn",
    "controls.fxFire": "Fire",
    "controls.fxLock": "Lock / Missile",
    "controls.fxScore": "Scoreboard",
    "controls.fxMobi": "MobiGlass",
    "controls.fxSelfDestruct": "Self-destruct",
    "controls.kbMouse": "Mouse",
    "controls.kbLClick": "L-Click",
    "controls.kbRClick": "R-Click",
    "controls.kbTab": "Tab ⟨hold⟩",

    "room.title": "LOBBY",
    "room.hint": "Waiting for players...",
    "room.switchTeam": "Switch team",
    "room.ready": "Go",
    "room.readyOn": "✓ READY",
    "room.shipLabel": "COMBAT SHIP",
    "room.namePlaceholder": "Room name...",
    "room.coopAI": "Co-op vs AI (waves)",
    "room.midGameJoin": "Join in progress",
    "room.balancedTeams": "Balanced teams",
    "room.scenarioSize": "Scenario size",
    "room.section": "Room",
    "room.squad": "Squad",
    "room.teamGreen": "Green team",
    "room.teamRed": "Red team",
    "room.aiWaves": "AI · WAVES",
    "room.gunner": "Gunner",
    "room.turret": "Turret",
    "room.emptySlot": "Empty",
    "room.board": "Board",
    "room.leaveShip": "Leave",
    "room.you": "(you)",
    "room.waitingShort": "WAITING",
    "room.emptyTeam": "No pilots yet",
    "room.unbalanced": "⚠ Unbalanced — even out teams to start",
    "room.sizeSmall": "Small",
    "room.sizeMedium": "Medium",
    "room.sizeLarge": "Large",
    "room.sizeHuge": "Huge",
    "room.asteroids": "ast.",

    "hud.status": "STATUS",
    "hud.hp": "HP",
    "hud.shield": "SHD",
    "hud.fuel": "Fuel",
    "hud.speed": "Spd",
    "hud.kd": "K/D",
    "hud.msl": "MSL",
    "hud.flares": "FLR",
    "hud.flight": "FLT",
    "hud.cannon": "GUN",
    "hud.cold": "COLD",
    "hud.coupled": "CPLD",
    "hud.decoupled": "FREE",
    "hud.alive": "Alive: {n}",

    "dead.selectShip": "SELECT SHIP",
    "dead.turret": "OR MAN A TURRET",
    "dead.switchTeam": "⇄ Switch team",
    "dead.leave": "↩ Leave to lobby",
    "dead.reserved": "RESERVED · [R] to enter",
    "dead.freeTurrets": "{n} free turret(s)",

    "mobi.pilot": "PILOT",
    "mobi.match": "MATCH",
    "mobi.controls": "CONTROLS",
    "mobi.settings": "SETTINGS",
    "settings.sound": "🔊 Sound",
    "settings.volEffects": "EFFECTS VOLUME",
    "settings.volMusic": "MUSIC VOLUME",
    "settings.musicTrack": "MUSIC TRACK",
    "settings.trackA": "Track A — Ambient",
    "settings.trackB": "Track B — Lo-Fi",
    "settings.language": "LANGUAGE",

    "gameover.hostHint": "You are the HOST · restart the match for everyone or return to the lobby",
    "gameover.guestHint": "Waiting for the HOST to restart... · you can return to the lobby anytime",
    "gameover.restart": "Restart match",
    "gameover.back": "↩ Back to lobby",
    "gameover.victory": "VICTORY",
    "gameover.defeat": "DEFEAT",
    "gameover.draw": "DRAW",

    "chat.placeholder": "Message... (Enter to send · Esc to cancel)",

    "conn.reconnecting": "Reconnecting",
    "conn.hint": "It will reconnect automatically once the server is back.",
    "conn.retry": "↻ Retry now",

    "boot.waking": "Connecting to the server...",
    "boot.cold": "The server was asleep. Waking it up, please wait a few seconds...",
    "boot.retry": "Retrying connection...",

    "game.destroyed": "DESTROYED",
    "game.respawnIn": "Respawning in {n}s...",
    "game.pressRespawn": "Press [{key}] to respawn",
    "game.spectator": "SPECTATOR · {name} · [TAB] to switch",
    "game.noTeamLives": "No team lives · waiting for the match to end",
    "game.systemsDown": "⚡ SYSTEMS DOWN",
    "game.selfDestructHold": "Hold [{key}] to self-destruct...",
    "game.selfDestructWarn": "⚠  SELF-DESTRUCT  ⚠",
    "game.selfDestructCancel": "[{key}] to cancel",
    "game.teamLives": "TEAM LIVES",
    "game.wave": "WAVE {n}",
    "game.enemies": "Enemies: {n}",
    "hud.waveLabel": "WAVE {n}/{total}",
    "hud.preparing": "PREPARING...",
    "hud.enemiesShort": "ENEMIES",
    "game.respawnTurret": "Press [{key}] to man {name}'s turret",
    "game.ally": "your ally",
    "game.teamLivesN": "Team lives: {n}",
    "game.respawnsInf": "Respawns: ∞",
    "game.chooseShip": "choose your ship or turret below",
    "game.chooseShipTurret": "or choose another ship/turret below",
    "hud.controlsLine": "[F1] MobiGlass · [Enter] Chat",

    "wave.start": "WAVE {n}",
    "wave.boss": "WAVE {n} — CAPITAL SHIP!",
    "wave.cleared": "WAVE {n} CLEARED",
    "wave.intermission": "Get ready... Wave {n}",
    "wave.complete": "PRACTICE COMPLETE!",
    "wave.defeat": "DEFEAT",

    "voice.lowFuel": "Fuel low",
    "voice.shieldsDown": "Shields down",
    "voice.hullCritical": "Hull critical",

    "result.wavesWon": "✦ WAVES CLEARED!",
    "result.wavesLost": "✖ YOU FELL",
    "result.draw": "⬡ DRAW",
    "result.greenWins": "⬡ GREEN TEAM WINS",
    "result.redWins": "⬡ RED TEAM WINS",
  },
};

let LANG = (function () {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "es" || saved === "en") return saved;
  } catch (e) { }
  return (navigator.language || "es").toLowerCase().startsWith("en") ? "en" : "es";
})();

// Devuelve el texto traducido, con sustitución de variables {nombre}.
// `lang` opcional: si se pasa, fuerza ese idioma (los componentes React lo
// pasan desde su estado para que el React Compiler vea la dependencia del
// idioma y recalcule los textos al cambiarlo). Los llamadores legacy (game.js)
// no lo pasan y usan el LANG global del módulo.
function i18nt(key, vars, lang) {
  const dict = I18N[lang || LANG] || I18N.es;
  let s = dict[key];
  if (s == null) s = I18N.es[key];
  if (s == null) return key;
  if (vars) for (const k in vars) s = s.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
  return s;
}

// Aplica las traducciones a los nodos marcados con data-i18n / data-i18n-ph.
function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = i18nt(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-ph]").forEach(el => {
    el.setAttribute("placeholder", i18nt(el.getAttribute("data-i18n-ph")));
  });
  // refleja el idioma en <html lang>
  document.documentElement.setAttribute("lang", LANG);
  // marca el botón de idioma activo
  document.querySelectorAll("[data-lang]").forEach(b =>
    b.classList.toggle("active", b.getAttribute("data-lang") === LANG));
}

const _langListeners = [];
// Registra un listener de cambio de idioma y devuelve una función para
// desuscribirlo (necesario para useSyncExternalStore en React).
function onLangChange(fn) {
  _langListeners.push(fn);
  return () => {
    const i = _langListeners.indexOf(fn);
    if (i >= 0) _langListeners.splice(i, 1);
  };
}

function setLang(l) {
  if (l !== "es" && l !== "en") return;
  LANG = l;
  try { localStorage.setItem("lang", l); } catch (e) { }
  applyI18n();
  _langListeners.forEach(fn => { try { fn(l); } catch (e) { } });
}

function getLang() { return LANG; }

// ── Superficie pública del módulo (consumida por game.js como ES module) ──
export { i18nt, applyI18n, onLangChange, setLang, getLang };
