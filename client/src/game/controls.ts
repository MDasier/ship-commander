// ── Keybindings (controles) ───────────────────────────────────────────
// Fuente de verdad de las asignaciones de teclas + su persistencia y la API
// que consume React (ControlsScreen) y el motor (input lee getBindings, el
// render usa bindingText). `bindings` se muta aquí; los consumidores leen
// copias vía getBindings() o el helper bindingText().

import { DEFAULT_BINDINGS, BINDING_LABELS, RESERVED_KEYS } from "./constants";
import { i18nt } from "../i18n.js";

type Bindings = Record<string, string | null>;

let bindings: Bindings = { ...DEFAULT_BINDINGS };
try {
  const saved = JSON.parse(localStorage.getItem("spacetactics_bindings") || "null");
  if (saved) bindings = { ...DEFAULT_BINDINGS, ...saved };
} catch (_) { }

function saveBindings() {
  localStorage.setItem("spacetactics_bindings", JSON.stringify(bindings));
}

export function displayKey(k: string | null): string {
  if (!k) return "—";
  const map: Record<string, string> = { " ": "Espacio", "arrowleft": "←", "arrowright": "→", "arrowup": "↑", "arrowdown": "↓" };
  return map[k] || k.toUpperCase();
}

let recordingHandler: ((e: KeyboardEvent) => void) | null = null;

function cancelRecording() {
  if (recordingHandler) {
    document.removeEventListener("keydown", recordingHandler, true);
    recordingHandler = null;
  }
}

function startRecording(action: string, keyEl: HTMLElement) {
  cancelRecording();
  keyEl.innerHTML = `<kbd class="bindingRecording">Presiona...</kbd>`;

  recordingHandler = function (e: KeyboardEvent) {
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

// ── Puente para la UI React ──
// React lee/escribe a través de esta API; la captura de tecla la hace el
// componente React y llama rebindKey().
const bindingsListeners: Array<(snap: Bindings) => void> = [];
export function onBindingsChange(fn: (snap: Bindings) => void) {
  bindingsListeners.push(fn);
  return () => {
    const i = bindingsListeners.indexOf(fn);
    if (i >= 0) bindingsListeners.splice(i, 1);
  };
}
function emitBindingsChange() {
  const snap = getBindings();
  bindingsListeners.forEach(fn => { try { fn(snap); } catch (_) { } });
}
export function getBindings(): Bindings { return { ...bindings }; }

// Reasigna `rawKey` a `action`. Devuelve "ok" | "reserved". Misma lógica que
// startRecording pero sin DOM (normaliza, rechaza reservadas, desvincula
// conflictos, persiste y notifica a React).
export function rebindKey(action: string, rawKey: string): "ok" | "reserved" {
  const newKey = (rawKey || "").toLowerCase();
  if (RESERVED_KEYS.has(newKey)) return "reserved";
  for (const [k, v] of Object.entries(bindings)) {
    if (k !== action && v === newKey) bindings[k] = null;
  }
  bindings[action] = newKey;
  saveBindings();
  emitBindingsChange();
  return "ok";
}
export function resetBindings() {
  bindings = { ...DEFAULT_BINDINGS };
  saveBindings();
  emitBindingsChange();
}

// Texto de tecla para una acción (usado por el render del HUD / pistas en juego).
export function bindingText(action: string): string {
  return displayKey(bindings[action] || (DEFAULT_BINDINGS as Bindings)[action]);
}

// Render legacy de la tabla de controles (el MobiGlass aún la usa en algún pane).
export function renderControlesPane(paneId = "pane-controles") {
  cancelRecording();
  const pane = document.getElementById(paneId);
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
    renderControlesPane(paneId);
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
