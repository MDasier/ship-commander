import { useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getPlayerName, setPlayerName, menuPlayOnline, menuSolo, SUPPORT_URL } from "../game.js";

// Menú principal migrado a React (Fase 1). El nombre se sincroniza con game.js
// vía getPlayerName/setPlayerName; COOP y Solo delegan en game.js, que sigue
// orquestando las pantallas legacy (lobby/soloSetup) por ahora.
export default function MainMenu() {
  const { t, lang, setLang } = useI18n();
  const [name, setName] = useState<string>(() => getPlayerName());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  // Guarda el nombre; devuelve false si está vacío (no se permite COOP sin tag).
  const save = (): boolean => {
    const v = name.trim();
    if (!v) {
      setError(true);
      setTimeout(() => setError(false), 1500);
      return false;
    }
    setPlayerName(v);
    setName(v);
    return true;
  };

  const onSave = () => {
    if (!save()) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const onCoop = () => {
    if (!save()) return;
    menuPlayOnline();
  };

  const onSolo = () => {
    const v = name.trim();
    if (v) setPlayerName(v);
    menuSolo();
  };

  return (
    <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center gap-6 bg-black/90 text-slate-100">
      <h1 className="text-4xl font-bold tracking-[0.2em] text-cyan-300">Ship Commander</h1>

      <div className="flex gap-2">
        {(["es", "en"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`rounded px-3 py-1 text-sm uppercase ${
              lang === l ? "bg-cyan-600 text-white" : "border border-slate-600 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-slate-400">{t("menu.tag")}</span>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            placeholder={t("menu.namePlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className={`rounded border bg-slate-900 px-3 py-2 text-center outline-none ${
              error ? "border-red-500" : "border-slate-600 focus:border-cyan-500"
            }`}
          />
          <button onClick={onSave} className="rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">
            {t("common.save")}
          </button>
          {saved && <span className="text-sm text-emerald-400">{t("menu.saved")}</span>}
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-3">
        <button
          onClick={onCoop}
          className="rounded-lg border border-cyan-500/50 bg-cyan-600/10 px-8 py-3 text-lg font-semibold tracking-wide hover:bg-cyan-600/25"
        >
          {t("menu.playOnline")}
        </button>
        <button
          onClick={onSolo}
          className="rounded-lg border border-cyan-500/50 bg-cyan-600/10 px-8 py-3 text-lg font-semibold tracking-wide hover:bg-cyan-600/25"
        >
          {t("menu.solo")}
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-controls"))}
          className="rounded-lg border border-slate-600 px-8 py-3 text-lg tracking-wide hover:bg-slate-800"
        >
          {t("menu.controls")}
        </button>
        <button
          onClick={() => window.open(SUPPORT_URL, "_blank", "noopener")}
          className="rounded-lg border border-pink-500/50 bg-pink-600/10 px-8 py-3 text-lg tracking-wide text-pink-200 hover:bg-pink-600/25"
        >
          {t("menu.support")}
        </button>
      </div>
    </div>
  );
}
