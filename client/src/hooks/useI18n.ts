import { useEffect, useState } from "react";
import { i18nt, onLangChange, getLang, setLang } from "../i18n.js";

// Suscribe el componente a los cambios de idioma de i18n.js. Cuando setLang()
// se llama (desde React o desde el menú legacy), notifica a los listeners y
// forzamos re-render con setLangState. onLangChange devuelve su unsubscribe.
export function useI18n() {
  const [lang, setLangState] = useState<string>(() => getLang());

  useEffect(() => onLangChange((l: string) => setLangState(l)), []);

  // Pasamos `lang` (estado) a i18nt para que el React Compiler vea que el texto
  // depende del idioma y recalcule las llamadas t("clave") al cambiarlo (si no,
  // las hoistea como constantes y los textos no se refrescaban).
  const t = (key: string, vars?: Record<string, unknown>) => i18nt(key, vars, lang) as string;
  return { t, lang, setLang: setLang as (l: string) => void };
}
