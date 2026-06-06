import { useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getMe, getTurretOptions, roomSend, roomSwitchTeam, roomLeave } from "../game";
import { Icon } from "./ds";
import ShipPicker from "./ShipPicker";

// Panel de muerte migrado a React (Fase 2). Al morir (evento "dead"), permite
// elegir nave para reaparecer o embarcar de artillero en una nave aliada con
// torreta libre. La cuenta atrás de reaparición se dibuja en el canvas (game.js).
// Las opciones de torreta se refrescan por intervalo (getTurretOptions).

type Turret = { id: string; name: string; type: string; free: number; reservedHere: boolean };

export default function DeadPanel() {
  const { t } = useI18n();
  const [, setTick] = useState(0);
  // Refresco ligero mientras el panel está montado (estado vivo del servidor).
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, []);

  const me = getMe() as { shipType?: string } | undefined;
  const turrets = (getTurretOptions() as Turret[]) || [];

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] grid place-items-center px-6 font-body">
      <div className="gs-panel pointer-events-auto flex max-h-[88vh] w-[min(1100px,94vw)] flex-col gap-4 overflow-y-auto p-6">
        <div className="gs-eyebrow text-center">{t("dead.selectShip")}</div>

        <ShipPicker
          selected={me?.shipType || "fighter"}
          onSelect={(type) => roomSend({ type: "selectShip", shipType: type })}
        />

        {turrets.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="gs-eyebrow text-center text-gs-grey-3">{t("dead.turret")}</div>
            <div className="flex flex-wrap justify-center gap-2.5">
              {turrets.map((tt) => (
                <button
                  key={tt.id}
                  className={`gs-panel flex min-w-[180px] flex-col items-start gap-0.5 px-4 py-3 text-left transition-all duration-200 ease-gs hover:border-gs-gold ${
                    tt.reservedHere ? "border-gs-gold-bright shadow-gs-glow" : ""
                  }`}
                  onClick={() => roomSend({ type: "boardShip", targetId: tt.id })}
                >
                  <span className="font-bold text-white">{tt.name}</span>
                  <span className="font-mono text-[11px] tracking-wider text-gs-gold-bright">
                    {tt.type.toUpperCase()}
                  </span>
                  <span className="text-[11px] text-gs-grey-2">
                    {tt.reservedHere ? t("dead.reserved") : t("dead.freeTurrets", { n: tt.free })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2.5 pt-1">
          <button className="gs-btn" onClick={() => roomSwitchTeam()}>
            {t("dead.switchTeam")}
          </button>
          <button className="gs-btn gs-btn-danger" onClick={() => roomLeave()}>
            <Icon name="arrowL" size={15} /> {t("dead.leave")}
          </button>
        </div>
      </div>
    </div>
  );
}
