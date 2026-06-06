import { useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import {
  getBindings,
  rebindKey,
  resetBindings,
  onBindingsChange,
  BINDING_LABELS,
  displayKey,
} from "../game";
import { Icon } from "./ds";

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

// Pantalla de controles migrada a React (Fase 1), reskin GuildSwarm cockpit.
// `bindings` vive en game.js; aquí solo se lee/escribe a través de su API. La
// captura de tecla se hace en el cliente y delega validación/persistencia en rebindKey().
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

  const pressLabel = t("controls.press") !== "controls.press" ? t("controls.press") : "…";

  return (
    <div
      className="fixed inset-0 z-[500] grid place-items-center bg-black/80 p-6 font-body backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="gs-panel gs-scroll max-h-[88vh] w-[min(860px,92vw)] animate-gs-fade overflow-y-auto p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="m-0 font-display text-2xl font-extrabold tracking-wide text-gs-gold-bright">
            {t("controls.title")}
          </h2>
          <button
            className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-gs border border-gs-rule/20 bg-transparent text-gs-grey-2 transition-all duration-200 ease-gs hover:border-gs-gold hover:text-white"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Acciones reasignables */}
        <div className="grid grid-cols-1 gap-x-10 gap-y-2.5 sm:grid-cols-2">
          {Object.keys(BINDING_LABELS).map((action) => {
            const rec = recording === action;
            return (
              <div key={action} className="flex items-center gap-3">
                <span className="flex-1 text-sm font-medium text-gs-rule">{label(action)}</span>
                <span className={`gs-key ${rec ? "animate-gs-pulse border-gs-gold-bright" : ""}`}>
                  {rec ? pressLabel : displayKey(bindings[action])}
                </span>
                <button
                  className="gs-btn gs-btn-ghost min-h-[34px] px-3 py-1.5 text-[12px] disabled:opacity-40"
                  onClick={() => setRecording(action)}
                  disabled={recording !== null}
                >
                  {t("controls.change")}
                </button>
              </div>
            );
          })}
        </div>

        <button
          className="gs-btn gs-btn-ghost mt-4 w-full text-[13px] text-gs-gold"
          onClick={() => resetBindings()}
        >
          {t("controls.reset")}
        </button>

        {/* Teclas fijas */}
        <div className="mt-6">
          <div className="gs-eyebrow mb-3 text-gs-grey-3">{t("controls.fixed")}</div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
            {FIXED_ROWS.map((row, i) => (
              <div key={i} className="flex items-center gap-3.5">
                <span className="gs-key min-w-[96px] border-gs-blue-soft/35 bg-gs-blue-soft/8 text-gs-blue-soft">
                  {row.literal ?? t(row.keyI18n!)}
                </span>
                <span className="text-sm text-gs-grey-2">{t(row.desc)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
