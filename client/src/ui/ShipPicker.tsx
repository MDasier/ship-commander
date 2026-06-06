import { useI18n } from "../hooks/useI18n";
import { ShipPreview, useShips } from "./ds";
import type { ShipMeta } from "./ds";

// Selector de nave en React (reskin GuildSwarm). Usa los stats REALES que envía
// el servidor en el init (getShips/useShips), no datos mock. Reutilizable en
// Vuela Solo y, más adelante, en el Lobby.

// Naves "recomendadas" como punto de partida (paridad con la selección por
// defecto del cliente legacy: el caza equilibrado).
const RECOMMENDED = new Set(["fighter"]);

function StatBar({ label, value, pct, kind }: { label: string; value: string | number; pct: number; kind?: "hp" | "shd" }) {
  const cls = "gs-statbar" + (kind === "shd" ? " is-shd" : kind === "hp" ? " is-hp" : "");
  return (
    <div className="flex items-center gap-2.5 text-[12px]">
      <span className="gs-hud-mono w-8 font-semibold text-gs-grey-2">{label}</span>
      <div className={`${cls} flex-1`}>
        <span style={{ width: Math.max(2, pct) + "%" }} />
      </div>
      <span className="gs-hud-mono w-12 text-right font-semibold text-gs-rule">{value}</span>
    </div>
  );
}

function ShipCard({
  type,
  ship,
  max,
  selected,
  onSelect,
  recommended,
}: {
  type: string;
  ship: ShipMeta;
  max: { hp: number; shd: number; vel: number; msl: number; radar: number };
  selected: boolean;
  onSelect: () => void;
  recommended: boolean;
}) {
  const { t } = useI18n();
  const shd = ship.maxShield ?? 0;
  const velPct = (ship.thrustMult / max.vel) * 100;
  const mslDisplay = (ship.crewCapacity ?? 1) > 1 ? `${ship.maxMissiles}+20` : String(ship.maxMissiles);
  const stats = [
    { k: "HP", val: ship.maxHp, pct: (ship.maxHp / max.hp) * 100, kind: "hp" as const },
    { k: "SHD", val: shd, pct: max.shd ? (shd / max.shd) * 100 : 0, kind: "shd" as const },
    { k: "VEL", val: Math.round(ship.thrustMult * 100) + "%", pct: velPct },
    { k: "MSL", val: mslDisplay, pct: (ship.maxMissiles / max.msl) * 100 },
    { k: "FIR", val: ship.radarSignature, pct: (ship.radarSignature / max.radar) * 100 },
  ];

  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`gs-panel relative w-[196px] flex-none cursor-pointer p-3.5 text-left transition-all duration-200 ease-gs ${
        selected ? "-translate-y-[3px] border-gs-gold-bright bg-gs-gold-bright/[0.06] shadow-gs-glow" : "hover:border-gs-gold"
      }`}
    >
      {recommended && (
        <span className="absolute right-2.5 top-2.5 rounded border border-gs-green px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-gs-green">
          {t("common.recommended")}
        </span>
      )}
      <ShipPreview type={type} w={130} h={66} />
      <div className={`my-3 text-center text-[15px] font-extrabold tracking-wide ${selected ? "text-gs-gold-bright" : "text-white"}`}>
        {ship.label || type.toUpperCase()}
      </div>
      <div className="mb-3 flex flex-col gap-1.5">
        {stats.map((s) => (
          <StatBar key={s.k} label={s.k} value={s.val} pct={s.pct} kind={s.kind} />
        ))}
      </div>
      {ship.desc && <p className="m-0 text-[11px] leading-snug text-gs-grey-2">{ship.desc}</p>}
    </button>
  );
}

export default function ShipPicker({
  selected,
  onSelect,
  label,
}: {
  selected: string;
  onSelect: (type: string) => void;
  label?: string;
}) {
  const { t } = useI18n();
  const ships = useShips();

  if (!ships) {
    return <div className="py-10 text-center text-gs-grey-3">…</div>;
  }

  const entries = Object.entries(ships);
  const max = {
    hp: Math.max(...entries.map(([, s]) => s.maxHp)),
    shd: Math.max(...entries.map(([, s]) => s.maxShield ?? 0)),
    vel: Math.max(...entries.map(([, s]) => s.thrustMult)),
    msl: Math.max(...entries.map(([, s]) => s.maxMissiles)),
    radar: Math.max(...entries.map(([, s]) => s.radarSignature)),
  };

  return (
    <div className="w-full">
      <div className="mb-4 text-center">
        <span className="gs-eyebrow">{label || t("room.shipLabel")}</span>
      </div>
      <div className="sc-scroll flex flex-wrap justify-center gap-3 overflow-x-auto px-1 pb-3.5 pt-1">
        {entries.map(([type, ship]) => (
          <ShipCard
            key={type}
            type={type}
            ship={ship}
            max={max}
            selected={selected === type}
            onSelect={() => onSelect(type)}
            recommended={RECOMMENDED.has(type)}
          />
        ))}
      </div>
    </div>
  );
}
