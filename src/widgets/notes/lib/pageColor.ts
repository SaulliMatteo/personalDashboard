import type { CSSProperties } from "react";

/**
 * Colore della pagina (colonna note_pages.color):
 * - null = colore del tema;
 * - una chiave della palette ("crema", "salvia"…): i colori vengono dai token
 *   --nq-page-<chiave>-bg/-ink, con un valore per il giorno e uno per la notte;
 * - "#rrggbb" = colore libero scelto dall'utente (anche le note di prima): il testo
 *   si sceglie chiaro o scuro in base al contrasto.
 */
export const PAGE_COLORS = [
  { key: "crema", label: "Crema" },
  { key: "salvia", label: "Salvia" },
  { key: "cielo", label: "Cielo" },
  { key: "rosa", label: "Rosa" },
  { key: "grafite", label: "Grafite" },
] as const;
export type PageColorKey = (typeof PAGE_COLORS)[number]["key"];

const KEYS = new Set<string>(PAGE_COLORS.map((c) => c.key));

export function isPageColorKey(value: unknown): value is PageColorKey {
  return typeof value === "string" && KEYS.has(value);
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** Accetta una chiave della palette o #rrggbb; tutto il resto diventa null (colore del tema). */
export function asPageColor(value: unknown): string | null {
  return isPageColorKey(value) || isHex(value) ? value : null;
}

export function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Variabili CSS per una pagina di colore libero: testo e bordi si adattano allo sfondo, così
 * il testo non diventa mai illeggibile (es. pagina bianca con la variante notte).
 * Le chiavi della palette non ne hanno bisogno: le gestisce il CSS (data-page-color).
 */
export function paperVars(color: string | null): Record<string, string> {
  if (!isHex(color)) return {};
  const light = luminance(color) > 0.5;
  const ink = light ? "#1a1a1e" : "#f2f2f4";
  return light
    ? {
        "--bg-card": color,
        "--note-page-bg": color,
        "--note-page-ink": ink,
        "--note-page-pattern": "none",
        "--text-primary": ink,
        "--text-secondary": "#3a3a42",
        "--text-muted": "#6e6e78",
        "--border-subtle": "rgba(0, 0, 0, 0.12)",
        "--surface-1": "rgba(0, 0, 0, 0.04)",
        "--surface-2": "rgba(0, 0, 0, 0.07)",
      }
    : {
        "--bg-card": color,
        "--note-page-bg": color,
        "--note-page-ink": ink,
        "--note-page-pattern": "none",
        "--text-primary": ink,
        "--text-secondary": "#d0d0d6",
        "--text-muted": "#9a9aa6",
        "--border-subtle": "rgba(255, 255, 255, 0.14)",
        "--surface-1": "rgba(255, 255, 255, 0.05)",
        "--surface-2": "rgba(255, 255, 255, 0.09)",
      };
}

/** Stile in linea della pagina (solo per i colori liberi). */
export function paperStyle(color: string | null): CSSProperties {
  return { ...paperVars(color), ...(isHex(color) ? { backgroundColor: color } : {}) } as CSSProperties;
}

/** Attributo per le chiavi della palette: `<div {...paperAttrs(color)}>`. */
export function paperAttrs(color: string | null): { "data-page-color"?: string } {
  return isPageColorKey(color) ? { "data-page-color": color } : {};
}

/** Colore da mostrare nel selettore libero (input type=color vuole sempre #rrggbb). */
export function customPageColor(color: string | null): string {
  return isHex(color) ? color : "#ffffff";
}
