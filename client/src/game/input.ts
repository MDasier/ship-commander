// ── Entrada del jugador: teclado + ratón ──────────────────────────────
// Estado de teclas pulsadas + registro de todos los listeners de input.
//
// Los handlers están fuertemente acoplados a funciones de game.ts (disparo,
// rayo, objetivo, autodestrucción, mobiglass…). En vez de importarlas (lo que
// crearía un ciclo con el monolito @ts-nocheck), game.ts las inyecta vía
// `installInput(deps)`. Los SFX y constantes sí se importan directamente.
//
// `keys` se exporta porque también lo lee el render loop (thrust → partículas)
// y el envío de input. `bindings` y `sdState` viven en game.ts y se mutan allí,
// así que se leen a través de getters en `deps` (siempre el valor vigente).

import { S } from "./state";
import { ws } from "./net";
import { PING_COOLDOWN_MS, CFG_RESPAWN_DELAY } from "./constants";
import {
  initAudio, playShootSound, playMissileSound, playAlertSound,
  playPingSound, playBeamReadySound, playAbilityReadySound,
} from "../sounds.js";

// Estado de teclas pulsadas (lectura compartida con el render loop).
export const keys: Record<string, boolean> = {};

// Suelta todas las teclas a la vez (evita inputs "atascados" al perder el foco,
// alt-tab, abrir el chat o un panel). El movimiento se lee de este estado.
export function clearKeys() {
  for (const k in keys) keys[k] = false;
}

// Dependencias inyectadas desde game.ts (funciones/estado del monolito).
interface InputDeps {
  canvas: HTMLCanvasElement;
  getBindings: () => Record<string, string | null>;
  getSdState: () => string | null;
  getMe: () => any;
  isCapitalPilot: () => boolean;
  fireWeapon: () => void;
  startAutoFire?: () => void;
  stopAutoFire: () => void;
  startBeamCharge: () => void;
  releaseBeamCharge: (cancel?: boolean) => void;
  cycleTargetByRadar: () => void;
  cycleSpectator: () => void;
  triggerPingEffect: (x: number, y: number) => void;
  openChat: () => void;
  openMobiglass: () => void;
  closeMobiglass: () => void;
  cancelSd: () => void;
  startSdCharge: () => void;
}

// Registra todos los listeners de input. Se llama una vez desde game.ts tras
// definir las funciones inyectadas.
export function installInput(deps: InputDeps) {
  const {
    canvas, getBindings, getSdState, getMe, isCapitalPilot,
    fireWeapon, stopAutoFire, startBeamCharge, releaseBeamCharge,
    cycleTargetByRadar, cycleSpectator, triggerPingEffect,
    openChat, openMobiglass, closeMobiglass, cancelSd, startSdCharge,
  } = deps;

  // Si la ventana pierde el foco o se oculta la pestaña, soltamos todo.
  addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearKeys(); });

  // ── Ratón ──
  canvas.addEventListener("mousemove", e => {
    S.mouseX = e.clientX;
    S.mouseY = e.clientY;
  });

  document.addEventListener("contextmenu", e => e.preventDefault());

  canvas.addEventListener("mousedown", e => {
    if (!S.inGame) return;
    const me = getMe();
    if (!me || me.dead) return;
    if (e.button === 0) {
      if (isCapitalPilot()) { startBeamCharge(); return; }
      stopAutoFire();
      S.mouseLeftHeld = true;
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

  // ── Teclado ──
  addEventListener("keydown", e => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;

    const bindings = getBindings();
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
      if (me && !me.dead && now >= S.nextPingAt) {
        S.nextPingAt = now + PING_COOLDOWN_MS;   // 1 ping cada 3 s
        S.scanUntil = now + 8000;
        S.pingEnemiesUntil = now + 2000;
        triggerPingEffect(me.x, me.y);
        initAudio();         // asegura el contexto de audio en este gesto de tecla
        playPingSound();     // sonar tipo Star Citizen
      }
    }

    if (bindings.inertiaDamp && key === bindings.inertiaDamp) {
      const me = getMe();
      if (me && !me.dead) S.inertiaDampActive = !S.inertiaDampActive;
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
    if (bindings.missile && key === bindings.missile && S.targetId) {
      const meM = getMe();
      const ready = meM && (meM.missileCooldown ?? 0) <= 0 &&
        (meM.missilesActive ?? 0) < (meM.maxMissiles ?? 0);
      if (ready) {
        ws.send(JSON.stringify({ type: "missile", targetId: S.targetId }));
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
        S.showScoreboard = true;
      }
    }

    if (bindings.respawn && key === bindings.respawn) {
      const meNow = getMe();
      // Vidas: en oleadas hace falta pool del equipo > 0; en PVP/vuelo libre es infinito
      const canRespawn = S.waveMode ? (S.teamLives ?? 0) > 0 : true;
      if (meNow && meNow.dead && canRespawn) {
        const elapsed = S.clientDeadAt ? Date.now() - S.clientDeadAt : 99999;
        if (elapsed >= (CFG_RESPAWN_DELAY * 1000)) {
          ws.send(JSON.stringify({ type: "respawn" }));
        }
      }
    }

    if (key === "enter" && !S.chatInputOpen) {
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
      if (S.mobiOpen) closeMobiglass();
      else openMobiglass();
    }

    if (e.key === "Delete") {
      if (e.repeat) return;
      e.preventDefault();
      if (S.chatInputOpen) return;
      const meNow = getMe();
      if (!meNow || meNow.dead) return;
      if (getSdState() === "countdown") cancelSd();
      else if (!getSdState()) startSdCharge();
    }
  });

  addEventListener("keyup", e => {
    // El estado de tecla SIEMPRE se limpia, aunque el foco esté en un input;
    // de lo contrario una tecla soltada mientras se escribe se quedaría "pegada".
    keys[e.key.toLowerCase()] = false;

    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;

    const bindings = getBindings();
    if (e.key === "Tab") S.showScoreboard = false;
    if (e.key === "Delete" && getSdState() === "charging") cancelSd();
    if (bindings.shoot && e.key.toLowerCase() === bindings.shoot && S.beamHeld) releaseBeamCharge();
  });

  // ── Envío de input al servidor (~30/s) + avisos de voz por flanco ──
  setInterval(() => {
    if (!S.inGame) return;
    const me = getMe();
    if (!me || me.dead) { S.beamHeld = false; S.beamWasReady = false; S.abilityWasReady = true; return; }  // evita carga "atascada" tras morir
    // Aviso eléctrico al quedar el rayo totalmente cargado (solo en el flanco de subida)
    const beamReady = me.shipType === "capital" && (me.beamCharge ?? 0) >= 0.999;
    if (beamReady && !S.beamWasReady) playBeamReadySound();
    S.beamWasReady = beamReady;
    // Aviso al quedar lista la habilidad [X] (EMP / mina), solo en el flanco de subida
    const hasAbility = !me.pilotingFor && (me.shipType === "emp" || me.shipType === "interceptor");
    const abilityCd = me.shipType === "emp" ? (me.empCooldown ?? 0) : (me.mineCooldown ?? 0);
    const abilityReady = hasAbility && abilityCd <= 0;
    if (abilityReady && !S.abilityWasReady) playAbilityReadySound();
    S.abilityWasReady = abilityReady;
    const bindings = getBindings();
    const targetAngle = Math.atan2(S.mouseY - canvas.height / 2, S.mouseX - canvas.width / 2);
    ws.send(JSON.stringify({
      type: "input",
      thrust: !!(bindings.thrust && keys[bindings.thrust]),
      reverse: !!(bindings.reverse && keys[bindings.reverse]),
      strafeLeft: !!(bindings.strafeLeft && keys[bindings.strafeLeft]),
      strafeRight: !!(bindings.strafeRight && keys[bindings.strafeRight]),
      inertiaDamp: S.inertiaDampActive,
      targetAngle
    }));
  }, 33);
}
