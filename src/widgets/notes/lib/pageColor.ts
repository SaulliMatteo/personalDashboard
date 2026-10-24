import type { CSSProperties } from "react";

export const PAGE_COLORS = [
  { value: "#ffffff", label: "Bianco" },
  { value: "#fff8e1", label: "Crema" },
  { value: "#fff1a8", label: "Giallo" },
  { value: "#dff3e4", label: "Verde" },
  { value: "#dbeafe", label: "Azzurro" },
  { value: "#fde2e4", label: "Rosa" },
  { value: "#2b2d33", label: "Grafite" },
  { value: "#111318", label: "Nero" },
] as const;

export const TEXT_COLORS = [
  "#000000", "#ffffff", "#e03131", "#f08c00", "#f2c500", "#2f9e44",
  "#1c7ed6", "#6741d9", "#d6336c", "#868e96", "#6c8dff", "#34d399",
];

/** Accetta solo #rrggbb (valori sconosciuti o corrotti diventano null = colore del tema). */
export function asPageColor(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

export function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Variabili CSS per una pagina colorata: testo e bordi si adattano allo sfondo,
 * così il testo non diventa mai illeggibile (es. pagina bianca con tema scuro).
 */
export function paperVars(color: string | null): Record<string, string> {
  if (!color) return {};
  const light = luminance(color) > 0.5;
  return light
    ? {
        "--bg-card": color,
        "--note-page-bg": color,
        "--note-page-ink": "#1a1a1e",
        "--note-page-pattern": "none",
        "--text-primary": "#1a1a1e",
        "--text-secondary": "#3a3a42",
        "--text-muted": "#6e6e78",
        "--border-subtle": "rgba(0, 0, 0, 0.12)",
        "--surface-1": "rgba(0, 0, 0, 0.04)",
        "--surface-2": "rgba(0, 0, 0, 0.07)",
      }
    : {
        "--bg-card": color,
        "--note-page-bg": color,
        "--note-page-ink": "#f2f2f4",
        "--note-page-pattern": "none",
        "--text-primary": "#f2f2f4",
        "--text-secondary": "#d0d0d6",
        "--text-muted": "#9a9aa6",
        "--border-subtle": "rgba(255, 255, 255, 0.14)",
        "--surface-1": "rgba(255, 255, 255, 0.05)",
        "--surface-2": "rgba(255, 255, 255, 0.09)",
      };
}

export function paperStyle(color: string | null): CSSProperties {
  return { ...paperVars(color), ...(color ? { backgroundColor: color } : {}) } as CSSProperties;
}