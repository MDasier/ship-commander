import { useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import {
  getBindings,
  rebindKey,
  resetBindings,
  onBindingsChange,
  BINDING_LABELS,
  displayKey,
} from "../game.js";

type Bindings = Record<string, string | null>;

// Teclas fijas (no reasignables), paridad con renderControlesPane() legacy.
const FIXED_ROWS: Array<{ literal?: string; keyI18n?: string; desc: string }> = [
  { keyI18n: "controls.kbMouse", desc: "controls.fxAim" },
  { keyI18n: "controls.kbLClick", desc: "controls.fxFire" },
  { keyI18n: "controls.kbRClick", desc: "controls.fxLock" },
  { keyI18n: "controls.kbTab", desc: "controls.fxScore" },
  { literal: "F1", desc: "controls.fxMobi" },
  { literal: "Del", desc: "controls.fxSelfDestruct" },
];

// Pantalla de controles migrada a React (Fase 1). `bindings` vive en game.js;
// aquí solo se lee/escribe a través de su API. La captura de tecla se hace en
// el cliente y delega la validación/persistencia en rebindKey().
export default function ControlsScreen({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [bindings, setBindings] = useState<Bindings>(() => getBindings());
  const [recording, setRecording] = useState<string | null>(null);

  // Sincroniza con la fuente de verdad de game.js.
  useEffect(() => onBindingsChange((b: Bindings) => setBindings(b)), []);

  // Captura de tecla mientras se reasigna una acción.
  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["shift", "control", "alt", "meta"].includes(k)) return;
      e.preventDefault();
      e.stopPropagation();
      if (k === "escape") {
        setRecording(null);
        return;
      }
      rebindKey(recording, e.key); // game.js normaliza, valida reservadas y persiste
      setRecording(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording]);

  // Cerrar con Escape cuando no se está grabando una tecla.
  useEffect(() => {
    if (recording) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [recording, onClose]);

  const label = (action: string) => {
    const key = "controls." + action;
    const tr = t(key);
    return tr !== key ? tr : (BINDING_LABELS as Record<string, string>)[action];
  };

  const pressLabel = t("controls.press") !== "controls.press" ? t("controls.press") : "Presiona…";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[min(640px,92vw)] max-h-[88vh] overflow-y-auto rounded-lg border border-cyan-500/40 bg-slate-950/95 p-6 text-slate-100 shadow-[0_0_40px_rgba(34,211,238,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-wide text-cyan-300">{t("controls.title")}</h2>
          <button
            className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800"
            onClick={onClose}
          >
            {t("common.backMenu")}
          </button>
        </div>

        <table className="w-full border-collapse text-sm">
          <tbody>
            {Object.keys(BINDING_LABELS).map((action) => (
              <tr key={action} className="border-b border-slate-800">
                <td className="py-2 pr-3">{label(action)}</td>
                <td className="py-2 pr-3">
                  {recording === action ? (
                    <kbd className="animate-pulse rounded bg-cyan-600/30 px-2 py-1 text-cyan-200">{pressLabel}</kbd>
                  ) : (
                    <kbd className="rounded bg-slate-800 px-2 py-1 text-slate-200">{displayKey(bindings[action])}</kbd>
                  )}
                </td>
                <td className="py-2 text-right">
                  <button
                    className="rounded border border-cyan-600/50 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-600/20 disabled:opacity-40"
                    onClick={() => setRecording(action)}
                    disabled={recording !== null}
                  >
                    {t("controls.change")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          className="mt-4 rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
          onClick={() => resetBindings()}
        >
          {t("controls.reset")}
        </button>

        <div className="mt-6">
          <div className="mb-2 text-xs uppercase tracking-widest text-slate-500">{t("controls.fixed")}</div>
          <table className="w-full border-collapse text-sm text-slate-400">
            <tbody>
              {FIXED_ROWS.map((row, i) => (
                <tr key={i} className="border-b border-slate-800/50">
                  <td className="py-1.5 pr-3">
                    <kbd className="rounded bg-slate-800/60 px-2 py-0.5">{row.literal ?? t(row.keyI18n!)}</kbd>
                  </td>
                  <td className="py-1.5">{t(row.desc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
