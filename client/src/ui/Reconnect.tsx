import { useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { Icon } from "./ds";

// Overlay de conexión perdida (Fase 1, reskin GuildSwarm cockpit). game.js emite
// el evento "conn-lost" y sigue gestionando la reconexión automática (sonda WS +
// recarga al volver el servidor). Aquí solo presentamos el estado y el reintento
// manual; "Reintentar ahora" recarga la página igual que la sonda al reconectar.
export default function Reconnect({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  const [count, setCount] = useState(30);

  // Cuenta atrás puramente cosmética (la reconexión real la conduce game.js).
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c <= 1 ? 30 : c - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 z-[600] grid place-items-center bg-[rgba(5,4,10,0.8)] font-body backdrop-blur-[3px]">
      <div
        className="flex w-[min(440px,90vw)] animate-gs-fade flex-col items-center gap-4 rounded-gs border border-gs-red p-8 text-center text-white shadow-[0_0_26px_rgba(155,57,53,0.55)]"
        style={{ background: "linear-gradient(180deg, rgba(40,18,22,0.92), rgba(20,16,30,0.95))" }}
      >
        <div className="grid h-16 w-16 animate-gs-pulse place-items-center rounded-full border border-gs-blue-soft/40 bg-gs-blue-soft/[0.06] text-gs-blue-soft">
          <Icon name="satellite" size={30} />
        </div>

        <div>
          <div className="gs-eyebrow mb-1.5 text-gs-grey-3">{t("conn.reconnecting")}</div>
          <div
            className="font-mono text-[46px] font-extrabold leading-none text-gs-red-bright tabular-nums"
            style={{ textShadow: "0 0 16px rgba(255,0,0,0.4)" }}
          >
            {count}
            <span className="text-2xl text-gs-red">s</span>
          </div>
        </div>

        <p className="m-0 max-w-[320px] leading-snug text-gs-grey-3">{t("conn.hint")}</p>

        <button
          className="gs-btn mt-1.5 border-gs-blue-soft/45 text-gs-blue-soft"
          onClick={onRetry}
        >
          <Icon name="refresh" size={16} /> {t("conn.retry")}
        </button>
      </div>
    </div>
  );
}
