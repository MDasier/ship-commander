import { useI18n } from "../hooks/useI18n";

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
    </div>
  );
}
