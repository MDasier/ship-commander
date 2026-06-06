import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../hooks/useI18n";
import { bindingText, onBindingsChange } from "../game";

// HUD en partida migrado a React (Fase 2). Caso especial: se actualiza a 60 fps.
// React renderiza solo la ESTRUCTURA con los MISMOS id que game.js rellena cada
// frame (updateHUD/updateTimer escriben textContent por id); así NO hay
// re-render de React por frame. Los <span> de valor van sin hijos para que un
// re-render (p. ej. cambio de idioma) no pise el valor que escribe game.js.
// El contenedor es pointer-events-none para no bloquear el canvas del juego.

const ROWS: { label: string; id: string }[] = [
  { label: "hud.hp", id: "hp" },
  { label: "hud.shield", id: "shieldEl" },
  { label: "hud.fuel", id: "fuel" },
  { label: "hud.speed", id: "speed" },
  { label: "hud.kd", id: "kd" },
  { label: "hud.msl", id: "mslCd" },
  { label: "hud.flares", id: "flaresEl" },
  { label: "hud.flight", id: "inertiaMode" },
  { label: "hud.cannon", id: "weaponHeatEl" },
];

// Leyenda de controles en partida (abajo-izquierda). Solo acciones críticas; el
// movimiento (propulsión/strafe/freno) se omite a propósito. Las acciones
// reasignables muestran la tecla actual (bindingText) y se actualizan al
// reasignar; las fijas llevan su tecla literal.
const ACTION_LEGEND: { action: string; label: string }[] = [
  { action: "special", label: "hud.legSpecial" },
  { action: "missile", label: "hud.legMissile" },
  { action: "flare", label: "controls.flare" },
  { action: "scan", label: "hud.legScan" },
  { action: "inertiaDamp", label: "hud.legInertia" },
];
const FIXED_LEGEND: { cap: string; label: string }[] = [
  { cap: "Tab", label: "controls.fxScore" },
  { cap: "F1", label: "controls.fxMobi" },
  { cap: "Del", label: "controls.fxSelfDestruct" },
];

// Keycap compacto (acento oro), estilo del design system.
function Cap({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-[28px] justify-center rounded border border-gs-gold-bright/30 bg-gs-gold-bright/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gs-gold-bright">
      {children}
    </span>
  );
}

function ControlLegend() {
  const { t } = useI18n();
  const [, bump] = useState(0);
  // Re-render al reasignar una tecla (bindingText lee el binding vivo).
  useEffect(() => onBindingsChange(() => bump((x) => x + 1)), []);
  return (
    <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1.5 text-right">
      <span className="gs-eyebrow text-gs-grey-3">{t("hud.legend")}</span>
      <div className="flex flex-col items-end gap-1">
        {ACTION_LEGEND.map((r) => (
          <div key={r.action} className="flex items-center gap-2 text-[12px]">
            <span className="text-gs-grey-2">{t(r.label)}</span>
            <Cap>{bindingText(r.action)}</Cap>
          </div>
        ))}
        {FIXED_LEGEND.map((r) => (
          <div key={r.cap} className="flex items-center gap-2 text-[12px]">
            <span className="text-gs-grey-2">{t(r.label)}</span>
            <Cap>{r.cap}</Cap>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Hud() {
  const { t } = useI18n();
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] font-body">
      {/* Telemetría (arriba-izquierda) — variante "Esquinas" del handoff:
          columna de líneas "LABEL: valor" sin panel, fuente mono. */}
      <div className="gs-hud-mono absolute left-6 top-6 flex flex-col gap-[7px]">
        {ROWS.map((r) => (
          <div key={r.id} className="text-[14px]">
            <span className="text-gs-grey-3">{t(r.label)}: </span>
            <span id={r.id} className="font-medium text-gs-rule" />
          </div>
        ))}
        {/* Habilidad especial [X] — game.js gestiona display y valores */}
        <div id="abilityRow" className="text-[14px]" style={{ display: "none" }}>
          <span className="text-gs-grey-3">
            <span id="abilityName">ESP</span>:{" "}
          </span>
          <span id="abilityCd" className="font-medium text-gs-gold-bright" />
        </div>
      </div>

      {/* Timer (arriba-centro) */}
      <div
        id="timer"
        className="gs-hud-mono absolute left-1/2 top-5 -translate-x-1/2 text-[30px] tracking-[0.34em] text-gs-rule"
        style={{ textShadow: "0 0 12px rgba(0,0,0,0.8)" }}
      >
        --:--
      </div>

      {/* Vivos + pistas (arriba-derecha) */}
      <div className="absolute right-7 top-5 text-right">
        <div id="alive" className="gs-hud-mono mb-1.5 text-[15px] text-gs-rule" />
        <div id="hudControls" className="font-mono text-[12px] text-gs-grey-3">
          {t("hud.controlsLine")}
        </div>
      </div>

      {/* Leyenda de controles críticos (abajo-izquierda) */}
      <ControlLegend />
    </div>
  );
}
