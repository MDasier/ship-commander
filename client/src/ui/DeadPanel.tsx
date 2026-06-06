import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../hooks/useI18n";
import { getMe, getTurretOptions, getDeadInfo, roomSend, roomSwitchTeam, roomLeave } from "../game";
import { Icon } from "./ds";
import ShipPicker from "./ShipPicker";

// Panel de muerte migrado a React (Fase 2), reorganizado en dos columnas:
//  · Izquierda: selección de nave para reaparecer (cards en filas de 3).
//  · Derecha: estado "DESTRUIDO" + instrucción de reaparición, oleada/enemigos,
//    vidas de equipo, torretas libres (entrar de artillero) y acciones.
// La info de la derecha (antes dibujada centrada en el canvas y que se
// superponía con las cards) llega de getDeadInfo(); se refresca por intervalo
// mientras el panel está montado. El panel solo se monta cuando se puede
// reaparecer (evento "dead"); el caso "sin vidas" lo dibuja el canvas.

type Turret = { id: string; name: string; type: string; free: number; reservedHere: boolean };
type DeadInfo = {
  waveMode: boolean;
  teamLives: number | null;
  canRespawn: boolean;
  inTurret: boolean;
  reservedPilotName: string | null;
  remaining: number;
  respawnKey: string;
  waveNum: number;
  waveTotal: number;
  enemiesLeft: number;
};

function Metric({ label, value, valueClass }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between rounded-gs border border-gs-rule/12 bg-black/30 px-3.5 py-2.5">
      <span className="gs-eyebrow text-gs-grey-3">{label}</span>
      <span className={`gs-hud-mono text-[15px] font-bold ${valueClass || "text-white"}`}>{value}</span>
    </div>
  );
}

export default function DeadPanel() {
  const { t } = useI18n();
  const [, setTick] = useState(0);
  // Refresco ligero mientras el panel está montado (estado vivo del servidor +
  // cuenta atrás de reaparición).
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);

  const me = getMe() as { shipType?: string } | undefined;
  const turrets = (getTurretOptions() as Turret[]) || [];
  const info = getDeadInfo() as DeadInfo;

  // Selección optimista de nave: estando muerto, selectShip no emite roomUpdate,
  // así que la card no se marcaba de forma fiable. Marcamos al instante al pulsar
  // y adoptamos el valor del servidor solo cuando cambia (no en cada tick), para
  // no revertir la selección durante el roundtrip.
  const serverShip = me?.shipType;
  const [picked, setPicked] = useState<string>(serverShip || "fighter");
  const prevServer = useRef(serverShip);
  useEffect(() => {
    if (serverShip !== prevServer.current) {
      prevServer.current = serverShip;
      if (serverShip) setPicked(serverShip);
    }
  });
  const selectShip = (type: string) => {
    setPicked(type);
    roomSend({ type: "selectShip", shipType: type });
  };

  const ready = info.remaining <= 0;
  // Texto del botón de reaparición: cuenta atrás (deshabilitado) → acción (listo).
  const respawnLabel = ready
    ? `${info.inTurret ? t("room.board") : t("controls.respawn")} · [${info.respawnKey}]`
    : t("game.respawnIn", { n: info.remaining });

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] grid place-items-center px-6 font-body">
      <div className="gs-panel pointer-events-auto grid max-h-[90vh] w-[min(1120px,96vw)] grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[640px_minmax(0,1fr)]">
        {/* Columna izquierda: selección de nave (filas de 3 cards) */}
        <div className="min-w-0">
          <ShipPicker
            selected={picked}
            onSelect={selectShip}
            label={t("dead.selectShip")}
          />
        </div>

        {/* Columna derecha: estado de muerte + acciones */}
        <div className="flex flex-col gap-4 lg:border-l lg:border-gs-rule/12 lg:pl-6">
          {/* DESTRUIDO + botón de reaparición (además de la tecla R) */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="font-display text-[28px] font-black tracking-[0.12em] text-gs-red"
              style={{ textShadow: "0 0 18px rgba(155,57,53,0.5)" }}
            >
              {t("game.destroyed")}
            </div>
            <button
              className={`gs-btn w-full ${
                ready ? "border-gs-green bg-gs-green/15 text-gs-green hover:border-gs-green hover:bg-gs-green/25" : ""
              }`}
              disabled={!ready}
              onClick={() => roomSend({ type: "respawn" })}
            >
              {respawnLabel}
            </button>
          </div>

          {/* Métricas: oleada / enemigos / vidas de equipo */}
          <div className="flex flex-col gap-2.5">
            {info.waveMode && (
              <>
                <Metric label={t("solo.waves")} value={`${info.waveNum}/${info.waveTotal}`} valueClass="text-gs-gold-bright" />
                <Metric label={t("hud.enemiesShort")} value={info.enemiesLeft} valueClass="text-gs-gold-bright" />
              </>
            )}
            <Metric
              label={t("game.teamLives")}
              value={info.waveMode ? (info.teamLives ?? 0) : "∞"}
              valueClass="text-gs-red"
            />
          </div>

          {/* Torretas libres: entrar de artillero en una nave aliada */}
          {turrets.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="gs-eyebrow text-gs-grey-3">{t("dead.turret")}</div>
              {turrets.map((tt) => (
                <button
                  key={tt.id}
                  className={`gs-panel flex flex-col items-start gap-0.5 px-3.5 py-2.5 text-left transition-all duration-200 ease-gs hover:border-gs-gold ${
                    tt.reservedHere ? "border-gs-gold-bright shadow-gs-glow" : ""
                  }`}
                  onClick={() => roomSend({ type: "boardShip", targetId: tt.id })}
                >
                  <span className="font-bold text-white">{tt.name}</span>
                  <span className="font-mono text-[11px] tracking-wider text-gs-gold-bright">{tt.type.toUpperCase()}</span>
                  <span className="text-[11px] text-gs-grey-2">
                    {tt.reservedHere ? t("dead.reserved") : t("dead.freeTurrets", { n: tt.free })}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Acciones */}
          <div className="mt-auto flex flex-col gap-2.5 pt-1">
            <button className="gs-btn w-full" onClick={() => roomSwitchTeam()}>
              {t("dead.switchTeam")}
            </button>
            <button className="gs-btn gs-btn-danger w-full" onClick={() => roomLeave()}>
              <Icon name="arrowL" size={15} /> {t("dead.leave")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
