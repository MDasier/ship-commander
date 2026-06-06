// ── Conexión WebSocket + reconexión automática ────────────────────────
// Crea el socket del juego y conduce el feedback de arranque en frío y la
// reconexión. El path es "/ws" (no la raíz) para no colisionar con el
// WebSocket de HMR del dev server de Vite; el servidor escucha en ese path.
//
// El manejador de mensajes entrantes (ws.onmessage) NO vive aquí: está
// fuertemente acoplado a funciones de game.ts (menús, salas, naves), así que
// game.ts lo cablea sobre el `ws` que exporta este módulo. Aquí solo va la
// plomería de conexión, que es autónoma.

import { S } from "./state";

const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
const wsHost = location.hostname ? location.host : "localhost:8080";
const wsURL = wsProto + "//" + wsHost + "/ws";

// Instancia del socket del juego. game.ts le asigna `onmessage`.
export const ws = new WebSocket(wsURL);

// ── Arranque en frío del servidor (anti-standby) ──
// Mientras no se haya conectado nunca, mostramos la pantalla de "despertando";
// si tarda, escalamos al mensaje de reposo. Tras la primera conexión, una caída
// pasa a usar el overlay normal de "conexión perdida".
// Overlay de arranque migrado a React (Boot.tsx); emitimos el evento "boot".
function hideBoot() {
  window.dispatchEvent(new CustomEvent("boot", { detail: { show: false } }));
}
function showBoot(cold: boolean) {
  window.dispatchEvent(new CustomEvent("boot", { detail: { show: true, cold } }));
}

// ── Reconexión automática ──
// El estado del jugador vive en el servidor atado a la conexión; al reconectar
// se recarga la página para empezar una sesión limpia y coherente.
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectProbe: WebSocket | null = null;

function scheduleReconnect(delay: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(tryReconnect, delay);
}

function tryReconnect() {
  // Cierra cualquier sonda previa
  if (reconnectProbe) { try { reconnectProbe.onopen = reconnectProbe.onerror = null; reconnectProbe.close(); } catch (e) { } }
  try {
    reconnectProbe = new WebSocket(wsURL);
  } catch (e) {
    scheduleReconnect(2000);
    return;
  }
  reconnectProbe.onopen = () => {
    // Servidor disponible de nuevo → recargar para reiniciar la sesión limpiamente
    try { reconnectProbe!.close(); } catch (e) { }
    location.reload();
  };
  reconnectProbe.onerror = () => {
    try { reconnectProbe!.close(); } catch (e) { }
    scheduleReconnect(2000); // reintenta cada 2 s mientras el servidor no responda
  };
}

function showConnLost() {
  // Aún no habíamos conectado nunca → es un arranque en frío, no una caída
  if (!S.everConnected) {
    showBoot(true);
    scheduleReconnect(1500);
    return;
  }
  if (S.connLost) return;
  S.connLost = true;
  // El overlay de conexión perdida está migrado a React (App.tsx → Reconnect);
  // game.ts sigue conduciendo la reconexión automática (sonda WS + recarga).
  window.dispatchEvent(new CustomEvent("conn-lost"));
  scheduleReconnect(500);
}

// ¿Se ha conectado alguna vez? (lo lee App al montar para no quedarse mostrando
// el overlay de arranque si el "open" ocurrió antes de montar React.)
export function isEverConnected() { return S.everConnected; }

// Si en 4 s no hemos conectado, probablemente el servidor estaba dormido
setTimeout(() => { if (!S.everConnected) showBoot(true); }, 4000);
ws.addEventListener("open", () => { S.everConnected = true; hideBoot(); });
ws.addEventListener("close", showConnLost);
ws.addEventListener("error", showConnLost);
