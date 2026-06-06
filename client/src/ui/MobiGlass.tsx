import { useEffect, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import {
  getMe,
  getPlayers,
  getMyId,
  roomLeave,
  getAudioSettings,
  setAudioEffects,
  setAudioMusic,
  setAudioTrack,
  setAudioMuted,
  getBindings,
  BINDING_LABELS,
  displayKey,
} from "../game.js";
import { Icon, LangToggle } from "./ds";

// MobiGlass en partida migrado a React (Fase 2). Overlay con pestañas
// Piloto/Partida/Controles/Ajustes. Lee el estado vivo del juego (getMe/
// getPlayers) refrescando mientras está abierto; los Ajustes van cableados al
// audio real (getAudioSettings + setAudio*). game.js abre/cierra vía evento
// "mobi"; onClose sincroniza el flag mobiOpen con closeMobiglass().

type Tab = "pilot" | "match" | "controls" | "settings";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "pilot", icon: "pilot", label: "mobi.pilot" },
  { id: "match", icon: "match", label: "mobi.match" },
  { id: "controls", icon: "controls", label: "mobi.controls" },
  { id: "settings", icon: "gear", label: "mobi.settings" },
];

const FIXED_ROWS: Array<{ literal?: string; keyI18n?: string; desc: string }> = [
  { keyI18n: "controls.kbMouse", desc: "controls.fxAim" },
  { keyI18n: "controls.kbLClick", desc: "controls.fxFire" },
  { keyI18n: "controls.kbRClick", desc: "controls.fxLock" },
  { keyI18n: "controls.kbTab", desc: "controls.fxScore" },
  { literal: "F1", desc: "controls.fxMobi" },
  { literal: "Del", desc: "controls.fxSelfDestruct" },
];

// Refresco ligero del estado vivo mientras el MobiGlass está abierto.
function useTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export default function MobiGlass({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [tab, setTab] = useState<Tab>("pilot");
  useTick(500);

  // Cerrar con Escape (sincroniza el flag de game.js vía onClose → closeMobiglass).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const me = getMe() as Record<string, unknown> | undefined;
  const tag = (me?.name as string) || "Pilot";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[500] grid animate-gs-fade place-items-center bg-[rgba(5,4,10,0.72)] font-body backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-[min(720px,92vw)] flex-col overflow-hidden rounded-gs border border-gs-gold bg-gs-ink/85 text-white shadow-gs-glow"
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-gs-rule/12 px-5 py-4">
          <Icon name="bolt" size={16} style={{ color: "var(--color-gs-gold-bright)" }} />
          <span className="gs-eyebrow">{t("mobiglass")}</span>
          <span className="gs-hud-mono text-[13px] text-gs-grey-3">| {tag}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="gs-btn gs-btn-danger ml-auto min-h-[34px] min-w-[34px] p-2"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="sc-scroll flex-1 overflow-y-auto px-6 py-5">
          {tab === "pilot" && <PilotTab me={me} />}
          {tab === "match" && <MatchTab onExit={onClose} />}
          {tab === "controls" && <ControlsTab />}
          {tab === "settings" && <SettingsTab lang={lang} setLang={setLang} />}
        </div>

        {/* Tabs (abajo) */}
        <div className="grid grid-cols-4 border-t border-gs-rule/12">
          {TABS.map((tb) => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                aria-pressed={active}
                className={`flex flex-col items-center justify-center gap-1.5 border-t-2 px-2 py-3.5 transition-all duration-200 ease-gs ${
                  active
                    ? "border-t-gs-gold-bright bg-gs-gold-bright/8 text-gs-gold-bright"
                    : "border-t-transparent text-gs-grey-3 hover:text-white"
                }`}
              >
                <Icon name={tb.icon} size={17} />
                <span className="text-[10px] font-bold uppercase tracking-wider">{t(tb.label)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetaBar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex justify-between">
        <span className="gs-eyebrow text-[11px] text-gs-grey-3">{label}</span>
        <span className="gs-hud-mono text-[13px] font-bold text-gs-rule">{value}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-[3px] bg-white/10">
        <span className="block h-full" style={{ width: Math.max(0, Math.min(100, pct)) + "%", background: color }} />
      </div>
    </div>
  );
}

function PilotTab({ me }: { me: Record<string, unknown> | undefined }) {
  const { t } = useI18n();
  if (!me) return <div className="text-gs-grey-3">—</div>;
  const team = (me.team as string) || "green";
  const teamColor = team === "green" ? "var(--color-gs-green)" : "var(--color-gs-red)";
  const hp = Math.floor((me.hp as number) ?? 0);
  const maxHp = (me.maxHp as number) ?? hp ?? 1;
  const fuel = Math.floor((me.fuel as number) ?? 0);
  const vel = Math.floor(Math.hypot((me.vx as number) ?? 0, (me.vy as number) ?? 0));
  const mslReady = ((me.missileCooldown as number) ?? 0) <= 0;
  return (
    <div>
      <div className="mb-5 flex items-center">
        <span className="font-display text-[26px] font-extrabold text-white">{(me.name as string) || "Pilot"}</span>
        <span
          className="ml-auto rounded border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider"
          style={{ color: teamColor, borderColor: teamColor }}
        >
          {team === "green" ? t("room.teamGreen") : t("room.teamRed")}
        </span>
      </div>
      <MetaBar label={t("hud.hp")} value={`${hp}/${maxHp}`} pct={(hp / Math.max(1, maxHp)) * 100} color="var(--color-gs-green)" />
      <MetaBar label={t("hud.fuel")} value={`${fuel}%`} pct={fuel} color="var(--color-gs-blue-soft)" />
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-[18px]">
        {[
          { l: t("hud.kd"), v: `${(me.kills as number) ?? 0}/${(me.deaths as number) ?? 0}` },
          { l: t("hud.speed"), v: String(vel) },
          { l: t("hud.msl"), v: mslReady ? t("common.ready") : Math.ceil(((me.missileCooldown as number) ?? 0) / 30) + "s", green: mslReady },
          { l: t("hud.cannon"), v: (me.shipType as string)?.toUpperCase() || "—" },
        ].map((s) => (
          <div key={s.l}>
            <div className="gs-eyebrow mb-1.5 text-[11px] text-gs-grey-3">{s.l}</div>
            <div className={`gs-hud-mono text-[24px] font-bold ${s.green ? "text-gs-green" : "text-white"}`}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchTab({ onExit }: { onExit: () => void }) {
  const { t } = useI18n();
  const players = (getPlayers() as Record<string, Record<string, unknown>>) || {};
  const myId = getMyId() as string;
  const list = Object.values(players);
  const green = list.filter((p) => (p.team as string) !== "red");
  const red = list.filter((p) => (p.team as string) === "red");
  const aliveOf = (arr: Record<string, unknown>[]) => arr.filter((p) => !p.dead).length;

  const TeamRow = ({ side, arr }: { side: "green" | "red"; arr: Record<string, unknown>[] }) => {
    const color = side === "green" ? "var(--color-gs-green)" : "var(--color-gs-red)";
    return (
      <div className="mb-1 flex items-center justify-between border-b py-2.5" style={{ borderColor: `${color}4d` }}>
        <span className="font-bold uppercase tracking-wide" style={{ color }}>
          {side === "green" ? t("room.teamGreen") : t("room.teamRed")}
        </span>
        <span className="gs-hud-mono text-[13px]" style={{ color }}>
          {aliveOf(arr)} / {arr.length}
        </span>
      </div>
    );
  };

  return (
    <div>
      <TeamRow side="green" arr={green} />
      <TeamRow side="red" arr={red} />
      <div className="mt-3.5 flex flex-col gap-1.5">
        {list.map((p) => (
          <div key={p.id as string} className="flex items-center gap-2.5 py-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: p.dead ? "#222" : (p.team as string) === "red" ? "var(--color-gs-red)" : "var(--color-gs-green)" }}
            />
            <span className={`font-bold ${(p.id as string) === myId ? "text-white" : "text-gs-rule"}`}>
              {(p.name as string) || "Pilot"} {(p.id as string) === myId && <span className="text-gs-grey-3">{t("room.you")}</span>}
            </span>
            <span className="gs-hud-mono ml-auto text-[13px] text-gs-grey-2">
              {(p.kills as number) ?? 0}K · {(p.deaths as number) ?? 0}D
            </span>
          </div>
        ))}
      </div>
      <button className="gs-btn gs-btn-danger mt-4 w-full py-3.5 text-[15px]" onClick={() => { onExit(); roomLeave(); }}>
        {t("dead.leave")}
      </button>
    </div>
  );
}

function ControlsTab() {
  const { t } = useI18n();
  const bindings = (getBindings() as Record<string, string | null>) || {};
  const label = (action: string) => {
    const key = "controls." + action;
    const tr = t(key);
    return tr !== key ? tr : (BINDING_LABELS as Record<string, string>)[action];
  };
  return (
    <div className="flex flex-col gap-1.5">
      {Object.keys(BINDING_LABELS as Record<string, string>).map((action) => (
        <div key={action} className="flex items-center gap-3">
          <span className="flex-1 text-sm font-medium text-gs-rule">{label(action)}</span>
          <span className="gs-key">{displayKey(bindings[action])}</span>
        </div>
      ))}
      <div className="gs-eyebrow mb-1 mt-4 text-gs-grey-3">{t("controls.fixed")}</div>
      {FIXED_ROWS.map((row, i) => (
        <div key={i} className="flex items-center gap-3.5">
          <span className="gs-key min-w-[96px] border-gs-blue-soft/35 bg-gs-blue-soft/8 text-gs-blue-soft">
            {row.literal ?? t(row.keyI18n!)}
          </span>
          <span className="text-sm text-gs-grey-2">{t(row.desc)}</span>
        </div>
      ))}
    </div>
  );
}

function SettingsTab({ lang, setLang }: { lang: string; setLang: (l: "es" | "en") => void }) {
  const { t } = useI18n();
  const [s, setS] = useState(() => getAudioSettings() as { effects: number; music: number; track: string; muted: boolean });

  return (
    <div>
      <button
        className={`mb-5 flex w-full items-center justify-center gap-2 rounded-gs border px-3 py-3 font-bold tracking-wide transition-all duration-200 ease-gs ${
          s.muted ? "border-gs-red/40 text-gs-red" : "border-gs-gold-bright/25 bg-gs-gold-bright/[0.05] text-gs-gold-bright"
        }`}
        onClick={() => {
          const next = !s.muted;
          setAudioMuted(next);
          setS({ ...s, muted: next });
        }}
      >
        <Icon name="speaker" size={16} /> {t("settings.sound")}
      </button>

      {[
        { key: "effects" as const, label: t("settings.volEffects"), set: setAudioEffects },
        { key: "music" as const, label: t("settings.volMusic"), set: setAudioMusic },
      ].map((row) => (
        <div key={row.key} className="mb-5">
          <div className="mb-2 flex justify-between">
            <span className="gs-eyebrow text-[11px] text-gs-grey-3">{row.label}</span>
            <span className="gs-hud-mono text-[13px] font-bold text-gs-gold-bright">{Math.round(s[row.key] * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s[row.key]}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              row.set(v);
              setS({ ...s, [row.key]: v });
            }}
            className="w-full cursor-pointer accent-gs-gold-bright"
            aria-label={row.label}
          />
        </div>
      ))}

      <div className="mb-5">
        <div className="gs-eyebrow mb-2 text-[11px] text-gs-grey-3">{t("settings.musicTrack")}</div>
        <select
          className="gs-input cursor-pointer"
          value={s.track}
          onChange={(e) => {
            setAudioTrack(e.target.value);
            setS({ ...s, track: e.target.value });
          }}
          style={{ appearance: "auto" }}
        >
          <option value="A">{t("settings.trackA")}</option>
          <option value="B">{t("settings.trackB")}</option>
        </select>
      </div>

      <div>
        <div className="gs-eyebrow mb-2 text-[11px] text-gs-grey-3">{t("settings.language")}</div>
        <LangToggle lang={lang} onChange={setLang} fixed={false} />
      </div>
    </div>
  );
}
