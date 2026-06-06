import { useSyncExternalStore } from "react";
import { i18nt, onLangChange, getLang } from "../i18n.js";

// Suscribe el componente a los cambios de idioma de i18n.js (store externo)
// con el patrón oficial de React: useSyncExternalStore(subscribe, getSnapshot).
// onLangChange devuelve su propia función de unsubscribe, así que sirve
// directamente como `subscribe`; getLang es el snapshot (cambia "es"↔"en").
// Devuelve el traductor `t` y el idioma actual; re-renderiza al llamar setLang().
export function useI18n() {
  const lang = useSyncExternalStore(onLangChange, getLang, getLang);
  return { t: i18nt as (key: string, vars?: Record<string, unknown>) => string, lang };
}
