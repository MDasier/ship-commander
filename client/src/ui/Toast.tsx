import { useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";

// Toast de avisos puntuales del servidor: game.js emite "game-notice" con una
// clave i18n (mensaje "notice", dirigido a UN jugador). Aparece arriba-centro y
// se auto-cierra. Lo usa la mecánica de torreteros (nave nodriza destruida,
// expulsado de la torreta, etc.). Mostrado por encima de todos los overlays.
export default function Toast() {
  const { t } = useI18n();
  const [msg, setMsg] = useState<{ id: number; key: string } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onNotice = (e: Event) => {
      const key = (e as CustomEvent<string>).detail;
      setMsg({ id: Date.now(), key });
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 5000);
    };
    window.addEventListener("game-notice", onNotice as EventListener);
    return () => {
      window.removeEventListener("game-notice", onNotice as EventListener);
      clearTimeout(timer);
    };
  }, []);

  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-[600] flex justify-center px-6 font-body">
      <div
        key={msg.id}
        className="gs-panel max-w-[520px] animate-gs-fade border-gs-gold-bright/50 bg-gs-void-soft/95 px-5 py-3 text-center text-[14px] font-semibold text-gs-gold-bright shadow-gs-glow"
      >
        {t(msg.key)}
      </div>
    </div>
  );
}
