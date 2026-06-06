import { useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { getPlayerName, setPlayerName, menuPlayOnline, menuSolo, SUPPORT_URL } from "../game";
import { Backdrop, BrandTitle, Icon, InfoDot, LangToggle, RadarMark } from "./ds";

// Menú principal migrado a React (Fase 1), reskin GuildSwarm cockpit con Tailwind.
// El nombre se sincroniza con game.js vía getPlayerName/setPlayerName; CO-OP y Solo
// delegan en game.js, que sigue orquestando las pantallas legacy (lobby/soloSetup).
export default function MainMenu() {
  const { t, lang, setLang } = useI18n();
  const [name, setName] = useState<string>(() => getPlayerName());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  // Guarda el nombre; devuelve false si está vacío (no se permite CO-OP sin tag).
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

  // Acciones del menú (icono + título + subtítulo). El soporte abre el enlace real.
  const actions = [
    { id: "coop", icon: "coop", label: t("menu.playOnline"), sub: t("menu.coopSub"), onClick: onCoop, meta: "↵" },
    { id: "solo", icon: "solo", label: t("menu.solo"), sub: t("menu.soloSub"), onClick: onSolo },
    {
      id: "controls",
      icon: "controls",
      label: t("menu.controls"),
      sub: t("menu.controlsSub"),
      onClick: () => window.dispatchEvent(new CustomEvent("open-controls")),
    },
  ];

  return (
    <div className="fixed inset-0 z-[400] overflow-y-auto bg-gs-void font-body text-white">
      <Backdrop />
      <LangToggle lang={lang} onChange={setLang} />

      <div className="relative z-[1] flex min-h-full animate-gs-fade flex-col items-center justify-center gap-11 px-6 py-20">
        <BrandTitle size={58} />

        {/* Fila de Tag */}
        <div className="w-full max-w-[560px]">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-2 flex items-center gap-2">
                <span className="gs-eyebrow">{t("menu.tag")}</span>
                <InfoDot text={t("menu.tagHelp")} />
              </label>
              <input
                className={`gs-input ${error ? "border-gs-red shadow-[0_0_0_1px_var(--color-gs-red)]" : ""}`}
                value={name}
                maxLength={16}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSave()}
                aria-label={t("menu.tag")}
                placeholder={t("menu.namePlaceholder")}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button className="gs-btn gs-btn-primary min-w-[110px]" onClick={onSave} disabled={!name.trim()}>
              <Icon name="save" size={17} /> {t("common.save")}
            </button>
          </div>
          <div className="mt-2 h-5">
            {saved && (
              <span
                className="inline-flex items-center gap-1.5 text-[13px] font-bold text-gs-green"
                style={{ animation: "gs-saved-pop 1.8s var(--ease-gs)" }}
              >
                {t("menu.saved")}
              </span>
            )}
          </div>
        </div>

        {/* Acciones — variante "Cuadr." (grid 2×2) del handoff */}
        <div className="grid w-full max-w-[560px] grid-cols-2 gap-3.5">
          {actions.map((a) => (
            <button
              key={a.id}
              className="gs-action min-h-[150px] flex-col items-start justify-between gap-3.5"
              onClick={a.onClick}
            >
              <span className="grid h-[30px] w-[30px] place-items-center text-gs-gold-bright">
                <Icon name={a.icon} size={28} />
              </span>
              <span>
                {a.label}
                <span className="mt-1.5 block font-body text-[12px] font-semibold normal-case tracking-normal text-gs-grey-3">
                  {a.sub}
                </span>
              </span>
            </button>
          ))}

          {/* Apoyo (abre el enlace real de soporte) */}
          <button
            className="gs-action gs-action-support min-h-[150px] flex-col items-start justify-between gap-3.5"
            onClick={() => window.open(SUPPORT_URL, "_blank", "noopener")}
          >
            <span className="grid h-[30px] w-[30px] place-items-center text-gs-pink">
              <Icon name="heart" size={26} />
            </span>
            <span>
              {t("menu.support")}
              <span className="mt-1.5 block font-body text-[12px] font-semibold normal-case tracking-normal text-gs-grey-3">
                {t("menu.supportSub")}
              </span>
            </span>
          </button>
        </div>
      </div>

      <RadarMark />
    </div>
  );
}
