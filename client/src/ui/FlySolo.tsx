import { useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { menuMain, startSolo } from "../game";
import { Backdrop, BackBtn, BrandTitle, LangToggle, Section, SegOption, useWorldPresets, presetKm } from "./ds";
import ShipPicker from "./ShipPicker";

// Pantalla de práctica en solitario migrada a React (Fase 2). Reúne modo,
// duración, tamaño y nave, y delega el arranque en game.js (startSolo), que
// conserva el flujo real (nombre + audio + mensaje WebSocket al servidor).
// Opciones de tamaño/duración con paridad al cliente legacy (medium/huge y
// "sin límite" deshabilitados; large y 5 min por defecto).
// Qué tamaños ofrece la práctica en solitario y cuáles van deshabilitados
// (paridad con el cliente legacy). El km se deriva de los WORLD_PRESETS del
// servidor (useWorldPresets) para no quedar desfasado.
const SOLO_SIZES = [
  { id: "medium", disabled: true },
  { id: "large", disabled: false },
  { id: "huge", disabled: true },
];

export default function FlySolo() {
  const { t, lang, setLang } = useI18n();
  const [mode, setMode] = useState<"waves" | "free">("waves");
  const [durationS, setDurationS] = useState(300);
  const [size, setSize] = useState("large");
  const [ship, setShip] = useState("fighter");
  const presets = useWorldPresets();

  // km de cada tamaño desde los presets del servidor (vacío hasta que llega el init).
  const sizes = SOLO_SIZES.map((s) => ({
    ...s,
    km: presets?.[s.id] ? presetKm(presets[s.id]) : "",
  }));

  const durations = [
    { secs: 180, label: "3 " + t("solo.min") },
    { secs: 300, label: "5 " + t("solo.min") },
    { secs: 600, label: "10 " + t("solo.min") },
    { secs: 0, label: t("solo.noLimit"), disabled: true },
  ];

  return (
    <div className="fixed inset-0 z-[400] overflow-y-auto bg-gs-void font-body text-white">
      <Backdrop />
      <LangToggle lang={lang} onChange={setLang} />
      <div className="fixed left-7 top-7 z-40">
        <BackBtn onClick={() => menuMain()} label={t("common.backMenu")} />
      </div>

      <div className="relative z-[1] flex min-h-full animate-gs-fade flex-col items-center justify-center gap-6 px-6 py-16">
        <BrandTitle size={44} sub={false} />
        <span className="gs-eyebrow">{t("solo.title")}</span>

        <div className="flex w-full max-w-[640px] flex-col gap-6">
          <Section label={t("solo.mode")}>
            <div className="mx-auto grid max-w-[380px] grid-cols-2 gap-2.5">
              <SegOption active={mode === "waves"} onClick={() => setMode("waves")} title={t("solo.waves")} />
              <SegOption active={mode === "free"} onClick={() => setMode("free")} title={t("solo.free")} />
            </div>
          </Section>

          <Section label={t("solo.duration")}>
            <div className="grid grid-cols-4 gap-2.5">
              {durations.map((d) => (
                <SegOption
                  key={d.secs}
                  active={durationS === d.secs && !d.disabled}
                  disabled={d.disabled}
                  onClick={() => setDurationS(d.secs)}
                  title={d.label}
                />
              ))}
            </div>
          </Section>

          <Section label={t("solo.size")}>
            <div className="mx-auto grid max-w-[420px] grid-cols-3 gap-2.5">
              {sizes.map((s) => (
                <SegOption
                  key={s.id}
                  active={size === s.id}
                  disabled={s.disabled}
                  onClick={() => setSize(s.id)}
                  title={s.km}
                />
              ))}
            </div>
          </Section>
        </div>

        <div className="w-full max-w-[1280px]">
          <ShipPicker selected={ship} onSelect={setShip} label={t("solo.ship")} />
        </div>

        <button
          className="gs-btn gs-btn-go w-full max-w-[640px] py-[18px] font-display text-[18px] tracking-[0.14em]"
          onClick={() => startSolo({ mode, size, durationS, shipType: ship })}
        >
          {t("solo.start")}
        </button>

        <p className="m-0 max-w-[560px] text-center text-[13px] text-gs-grey-3">{t("solo.hint")}</p>
      </div>
    </div>
  );
}
