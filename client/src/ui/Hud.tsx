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
      {/* Panel de estado (arriba-izquierda) */}
      <div className="gs-panel absolute left-6 top-6 min-w-[210px] border-l-[3px] border-l-gs-gold-bright px-[18px] py-4">
        <div className="gs-eyebrow mb-3 text-[10px] text-gs-gold">{t("hud.status")}</div>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {ROWS.map((r) => (
            <div key={r.id} className="contents">
              <span className="gs-hud-mono text-[12px] font-semibold text-gs-grey-3">{t(r.label)}</span>
              <span id={r.id} className="gs-hud-mono text-right text-[13px] font-semibold text-gs-rule" />
            </div>
          ))}
          {/* Habilidad especial [X] — game.js gestiona display y valores */}
          <div id="abilityRow" className="contents" style={{ display: "none" }}>
            <span id="abilityName" className="gs-hud-mono text-[12px] font-semibold text-gs-gold">
              ESP
            </span>
            <span id="abilityCd" className="gs-hud-mono text-right text-[13px] font-semibold text-gs-gold-bright" />
          </div>
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
