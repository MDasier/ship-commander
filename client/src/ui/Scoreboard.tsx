import { useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getPlayers, getMyId } from "../game";

// Marcador (Tab mantenido) migrado a React con la estética del design system.
// Antes se dibujaba en canvas (draw.ts). Lee el estado vivo (getPlayers) y se
// refresca por intervalo mientras está montado. Es pointer-events-none: se
// muestra encima sin bloquear el control de la nave.

type P = Record<string, any>;

function TeamColumn({ side, players, myId }: { side: "green" | "red"; players: P[]; myId: string }) {
  const { t } = useI18n();
  const color = side === "green" ? "var(--color-gs-green)" : "var(--color-gs-red)";
  const title = side === "green" ? t("room.teamGreen") : t("room.teamRed");
  const alive = players.filter((p) => !p.dead).length;
  const sum = (k: string) => players.reduce((s, p) => s + (p[k] || 0), 0);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3 border-b pb-2" style={{ borderColor: `${color}4d` }}>
        <span className="font-bold uppercase tracking-wide" style={{ color }}>{title}</span>
        <span className="gs-hud-mono text-[12px]" style={{ color }}>
          {alive}/{players.length} · {sum("kills")}K · {sum("assists")}A · {Math.round(sum("damageDealt"))} dmg
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 px-2">
        <span className="gs-eyebrow text-[10px] text-gs-grey-3">{t("scoreboard.pilot")}</span>
        <span className="gs-hud-mono text-right text-[11px] text-gs-grey-3">K · D · A · DMG</span>
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        {players.length === 0 ? (
          <div className="px-2 py-2 text-[13px] text-gs-grey-3">{t("room.emptyTeam")}</div>
        ) : (
          players.map((p) => {
            const mine = p.id === myId;
            return (
              <div
                key={p.id as string}
                className={`grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-gs px-2 py-1.5 ${
                  mine ? "bg-white/[0.06]" : ""
                } ${p.dead ? "opacity-40" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 flex-none rounded-full" style={{ background: p.dead ? "#555" : color }} />
                  <span className={`truncate ${mine ? "font-bold text-white" : "text-gs-rule"}`}>
                    {(p.name as string) || "Pilot"}
                    {mine && <span className="ml-1 font-normal text-gs-grey-3">{t("room.you")}</span>}
                  </span>
                </span>
                <span className="gs-hud-mono text-right text-[13px] tabular-nums text-gs-grey-2">
                  {p.kills || 0} · {p.deaths || 0} · {p.assists || 0} · {Math.round(p.damageDealt || 0)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function Scoreboard() {
  const { t } = useI18n();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 400);
    return () => clearInterval(id);
  }, []);

  const players = Object.values((getPlayers() as Record<string, P>) || {});
  const myId = getMyId() as string;
  const byKills = (a: P, b: P) => (b.kills || 0) - (a.kills || 0);
  const green = players.filter((p) => (p.team || "green") === "green").sort(byKills);
  const red = players.filter((p) => p.team === "red").sort(byKills);

  return (
    <div className="pointer-events-none fixed inset-0 z-[300] grid place-items-center bg-black/55 px-6 font-body backdrop-blur-[1px]">
      <div className="gs-panel max-h-[90vh] w-[min(1000px,95vw)] overflow-y-auto p-6">
        <div className="mb-4 text-center">
          <span className="gs-eyebrow">{t("scoreboard.title")}</span>
          <span className="ml-2 text-[12px] text-gs-grey-3">{t("scoreboard.hint")}</span>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
          <TeamColumn side="green" players={green} myId={myId} />
          <TeamColumn side="red" players={red} myId={myId} />
        </div>
      </div>
    </div>
  );
}
