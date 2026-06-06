// Constantes y tablas estaticas del cliente.
// Valores de solo lectura compartidos por el motor (game.js) y la UI React.
// Extraido de game.js (Fase A modular). Sin estado mutable.

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
  brake: " ",
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
  brake: "Brake",
};

// Teclas que no se pueden asignar (fijas)
const RESERVED_KEYS = new Set(["tab", "f1", "delete", "escape"]);

// ── Navegación del menú principal ──────────────
// Enlace de donaciones — reemplázalo por el tuyo (PayPal.me, Ko-fi, etc.)
const SUPPORT_URL = "https://www.paypal.com/paypalme/mdasier";

const MENU_SCREENS = ["mainMenu", "lobby", "soloSetup", "controlsScreen", "room"];
// Pantallas cuyo UI ya vive en React (App.tsx las monta como overlay). A medida
// que se migran pantallas legacy se añaden aquí para ocultar el #menu antiguo.
const REACT_SCREENS = new Set(["mainMenu", "soloSetup", "lobby", "room"]);

// Debe coincidir con server config RESPAWN_DELAY
const CFG_RESPAWN_DELAY = 5;

export {
  DEFAULT_BINDINGS, BINDING_LABELS, RESERVED_KEYS,
  SUPPORT_URL, MENU_SCREENS, REACT_SCREENS, CFG_RESPAWN_DELAY,
};
