import { useI18n } from "../hooks/useI18n";

// Overlay de arranque/despertar del servidor (anti-standby, p. ej. Render),
// migrado a React + Tailwind con el look GuildSwarm. game.js (net.ts) emite el
// evento "boot" {show,cold} antes de la primera conexión; al conectar, show:false.
export default function Boot({ cold }: { cold: boolean }) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[700] grid place-items-center bg-gs-void px-6 text-center font-body">
      <div className="flex max-w-[34rem] flex-col items-center gap-5">
        <div
          className="h-14 w-14 animate-gs-spin rounded-full"
          style={{ border: "4px solid rgba(144,141,72,0.25)", borderTopColor: "var(--color-gs-gold-bright)" }}
        />
        <div className="gs-eyebrow text-[13px] text-gs-grey-2">{t("boot.waking")}</div>
        {cold && <p className="m-0 max-w-[360px] text-[13px] leading-relaxed text-gs-grey-3">{t("boot.cold")}</p>}
      </div>
    </div>
  );
}
