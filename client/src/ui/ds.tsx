// Primitivos del design system (GuildSwarm × Ship Commander) en React.
// Iconos monoline tipo lucide (currentColor), título de marca, toggle de idioma,
// fondo cockpit (wash + starfield) y la marca de radar decorativa.
// El estilo vive en index.css (tokens @theme + clases .gs-*).
import type { CSSProperties, ReactNode } from "react";

// ── Iconos (viewBox 24, trazo currentColor) ──────────────────
const ICON_PATHS: Record<string, ReactNode> = {
  coop: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  solo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
    </>
  ),
  controls: (
    <>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </>
  ),
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />,
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </>
  ),
  chevronR: <polyline points="9 18 15 12 9 6" />,
  arrowL: (
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </>
  ),
  refresh: (
    <>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
    </>
  ),
  satellite: (
    <>
      <path d="M4 10a7.31 7.31 0 0 0 10 10Z" />
      <path d="m9 15 6-6" />
      <path d="M17 8a4 4 0 0 0-4-4" />
      <path d="M21 8a8 8 0 0 0-8-8" />
    </>
  ),
};

export function Icon({
  name,
  size = 22,
  stroke = 1.6,
  className,
  style,
}: {
  name: keyof typeof ICON_PATHS | string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const body = ICON_PATHS[name];
  if (!body) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}

// ── Título de marca ──────────────────────────────────────────
export function BrandTitle({ size = 58, subtitle }: { size?: number; subtitle?: string }) {
  return (
    <div className="text-center">
      <h1
        className="m-0 font-display font-black leading-none tracking-[0.04em] text-gs-gold-bright"
        style={{ fontSize: size, textShadow: "0 0 24px rgba(255,198,25,0.45), 0 0 2px rgba(255,198,25,0.6)" }}
      >
        Ship Commander
      </h1>
      {subtitle && (
        <div className="mt-3 font-body text-[0.62rem] font-bold tracking-[0.42em] text-gs-grey-2">{subtitle}</div>
      )}
    </div>
  );
}

// ── Toggle de idioma (ES / EN) ───────────────────────────────
export function LangToggle({
  lang,
  onChange,
  fixed = true,
}: {
  lang: string;
  onChange: (l: "es" | "en") => void;
  fixed?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex gap-1.5 ${fixed ? "fixed right-7 top-6 z-40" : ""}`}
    >
      {(["es", "en"] as const).map((code) => {
        const on = lang === code;
        return (
          <button
            key={code}
            onClick={() => onChange(code)}
            aria-pressed={on}
            className={`min-h-9 min-w-11 cursor-pointer rounded-md border px-3 py-1.5 font-mono text-[13px] font-semibold tracking-[0.1em] transition-all duration-200 ease-gs ${
              on
                ? "border-gs-gold-bright bg-gs-gold-bright/10 text-gs-gold-bright shadow-[0_0_12px_rgba(255,198,25,0.3)]"
                : "border-gs-rule/20 bg-black/40 text-gs-grey-2 hover:border-gs-gold hover:text-white"
            }`}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// ── Fondo cockpit: wash dorado + starfield a la deriva ───────
export function Backdrop() {
  return (
    <>
      <div className="gs-bg-wash" aria-hidden="true" />
      <div className="gs-stars" aria-hidden="true" />
    </>
  );
}

// ── Marca de radar decorativa (esquina inferior derecha) ─────
export function RadarMark({ size = 220 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-7 right-7 z-0 opacity-[0.16]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(217,217,217,0.5)" strokeWidth="1" />
        <circle cx="100" cy="100" r="62" fill="none" stroke="rgba(217,217,217,0.35)" strokeWidth="1" />
        <circle cx="100" cy="100" r="30" fill="none" stroke="rgba(217,217,217,0.3)" strokeWidth="1" />
        <line x1="100" y1="4" x2="100" y2="196" stroke="rgba(217,217,217,0.3)" strokeWidth="1" />
        <line x1="4" y1="100" x2="196" y2="100" stroke="rgba(217,217,217,0.3)" strokeWidth="1" />
      </svg>
    </div>
  );
}

// ── Tooltip de ayuda (botón "?") ─────────────────────────────
export function InfoDot({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        aria-label={text}
        className="grid h-[18px] w-[18px] cursor-help place-items-center rounded-full border border-gs-rule/35 bg-transparent p-0 text-[11px] font-bold leading-none text-gs-grey-2"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[130%] left-1/2 z-50 w-[220px] -translate-x-1/2 rounded-gs border border-gs-gold bg-gs-void-soft px-3 py-2.5 text-[12px] font-normal leading-snug text-gs-rule opacity-0 shadow-gs-glow transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
