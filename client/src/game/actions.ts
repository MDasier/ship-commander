// ── Acciones de combate del jugador ───────────────────────────────────
// Disparo + calor del arma, carga/disparo del rayo de la Capital, cámara de
// espectador y autodestrucción. Envían mensajes al servidor (ws) y reproducen
// SFX; el estado vive en `S`. Los listeners de input (game/input.ts) invocan
// estas funciones (inyectadas desde game.ts).

import { S } from "./state";
import { ws } from "./net";
import { getMe } from "./render/canvas";
import { playAlertSound, playShootSound, playBeamFireSound, playSelfDestructBeep } from "../sounds.js";

// ── Weapon heat system ──
let weaponFireTimer: ReturnType<typeof setTimeout> | null = null;

const HEAT_PER_SHOT = 10;   // calor por bala
const HEAT_DECAY_MS = 46;   // milisegundos de enfriamiento
const HEAT_DECAY_AMT = 1;   // calor que baja por tick
const BASE_FIRE_MS = 100;   // cadencia
const OVERHEAT_LIMIT = 99;  // calor máximo (umbral de bloqueo)
const RECOVER_LIMIT = 60;   // calor mínimo (umbral de descongestión)

// ── FIRE LOOP ──
export function fireWeapon() {
  const me = getMe();

  if (!me || me.dead || !S.inGame) {
    stopAutoFire();
    return;
  }

  if (S.weaponOverheated) {
    playAlertSound("weaponLocked");   // intento de disparo con el arma bloqueada
    stopAutoFire();
    return;
  }

  ws.send(JSON.stringify({ type: "shoot" }));
  playShootSound();

  S.weaponHeat = Math.min(100, S.weaponHeat + HEAT_PER_SHOT);

  if (S.weaponHeat >= OVERHEAT_LIMIT) {
    S.weaponOverheated = true;
    playAlertSound("weaponLocked");   // el arma acaba de sobrecalentarse
    stopAutoFire();
    return;
  }

  // SOLO depende del input real
  if (!S.mouseLeftHeld) {
    if (weaponFireTimer) clearTimeout(weaponFireTimer);
    weaponFireTimer = null;
    return;
  }

  const heatFactor = S.weaponHeat / 100;
  const interval = BASE_FIRE_MS * (1 + Math.pow(heatFactor, 2) * 4);
  weaponFireTimer = setTimeout(fireWeapon, interval);
}

export function startAutoFire() {
  S.mouseLeftHeld = true;
  if (weaponFireTimer) return;   // evita duplicar loops
  fireWeapon();
}

export function stopAutoFire() {
  S.mouseLeftHeld = false;
  if (weaponFireTimer) clearTimeout(weaponFireTimer);
  weaponFireTimer = null;
}

// Enfriamiento de arma (tick global).
setInterval(() => {
  if (S.weaponHeat > 0) {
    S.weaponHeat = Math.max(0, S.weaponHeat - HEAT_DECAY_AMT);
    if (S.weaponOverheated && S.weaponHeat <= RECOVER_LIMIT) {
      S.weaponOverheated = false;
    }
  }
}, HEAT_DECAY_MS);

// ── Rayo de la Capital: mantener pulsado para cargar, soltar para disparar ──
export function isCapitalPilot(): boolean {
  const me = getMe();
  return !!(me && !me.dead && me.shipType === "capital" && !me.pilotingFor);
}
export function startBeamCharge() {
  if (S.beamHeld) return;            // ignora repetición de tecla
  S.beamHeld = true;
  ws.send(JSON.stringify({ type: "beamCharge", charging: true }));
}
// cancel=true → soltar sin disparar (mouseleave, perder foco, muerte). Evita que
// el rayo se dispare por un release involuntario aunque estuviera cargado.
export function releaseBeamCharge(cancel = false) {
  if (!S.beamHeld) return;
  S.beamHeld = false;
  const me = getMe();
  if (!cancel && me && (me.beamCharge ?? 0) >= 0.999) playBeamFireSound();  // solo si llegó a disparar
  ws.send(JSON.stringify({ type: "beamCharge", charging: false, cancel }));
}

// ── Spectator ──
export function cycleSpectator() {
  const living = Object.values(S.players).filter((p: any) => !p.dead && p.id !== S.myId);
  if (living.length === 0) { S.specTargetId = null; return; }
  if (!S.specTargetId) { S.specTargetId = living[0].id; return; }
  const idx = living.findIndex((p: any) => p.id === S.specTargetId);
  S.specTargetId = living[(idx + 1) % living.length].id;
}

// ── Self-destruct ──
// sdState/sdCountdown/sdHoldStart viven en S (la UI los lee desde el render);
// los handles de timer son locales (solo aquí se manejan).
let sdHoldTimer: ReturnType<typeof setTimeout> | null = null;
let sdInterval: ReturnType<typeof setInterval> | null = null;

export function startSdCharge() {
  const me = getMe();
  if (!me || me.dead || S.sdState) return;
  S.sdState = "charging";
  S.sdMode = "selfdestruct";
  S.sdHoldStart = Date.now();
  sdHoldTimer = setTimeout(startSdCountdown, 2000);
}

// Suicidio del torretero (Regla 3): mantener Del ~1.5s → muere al instante (sin
// la cuenta atrás de 5s de la autodestrucción). El server libera su torreta.
export function startSuicideCharge() {
  const me = getMe();
  if (!me || me.dead || S.sdState) return;
  S.sdState = "charging";
  S.sdMode = "suicide";
  S.sdHoldStart = Date.now();
  sdHoldTimer = setTimeout(() => {
    sdHoldTimer = null;
    S.sdState = null;
    ws.send(JSON.stringify({ type: "suicide" }));
  }, 1500);
}

function startSdCountdown() {
  S.sdState = "countdown";
  S.sdCountdown = 5;
  playSelfDestructBeep(5);
  sdInterval = setInterval(() => {
    S.sdCountdown--;
    if (S.sdCountdown > 0) {
      playSelfDestructBeep(S.sdCountdown);
    } else {
      if (sdInterval) clearInterval(sdInterval);
      sdInterval = null;
      S.sdState = null;
      ws.send(JSON.stringify({ type: "selfDestruct" }));
    }
  }, 1000);
}

export function cancelSd() {
  if (sdHoldTimer) clearTimeout(sdHoldTimer);
  if (sdInterval) clearInterval(sdInterval);
  S.sdState = null;
  sdHoldTimer = null;
  sdInterval = null;
  S.sdCountdown = 0;
}
