/**
 * Colore del titolo di una nota (colonna notes.title_color): null = colore del tema,
 * altrimenti "#rrggbb" scelto dall'utente.
 *
 * Il colore si salva esatto; quando si mostra, se sullo sfondo vero (pagina, card, post-it,
 * pigmento) il contrasto è troppo basso, si schiarisce o si scurisce quanto basta, senza
 * cambiare tinta. Logica PURA (niente DOM): si prova con uno script .mts lanciato con node.
 */

/** Preset della palette (colori scelti dall'utente, come quelli della penna). */
export const TITLE_COLORS = [
  { color: "#e03131", label: "Rosso" },
  { color: "#f08c00", label: "Arancio" },
  { color: "#f5c400", label: "Giallo" },
  { color: "#2f9e44", label: "Verde" },
  { color: "#0c8599", label: "Petrolio" },
  { color: "#1c7ed6", label: "Blu" },
  { color: "#7048e8", label: "Viola" },
  { color: "#d6336c", label: "Rosa" },
] as const;

/** Contrasto minimo: titolo grande (editor, esportazioni) e titoli piccoli (elenco, widget). */
export const CONTRAST_LARGE = 3;
export const CONTRAST_SMALL = 4.5;

export type Rgb = [number, number, number];

export function isTitleColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** #rrggbb (minuscolo) o null: tutto il resto è "colore del tema". */
export function asTitleColor(value: unknown): string | null {
  return isTitleColor(value) ? value.toLowerCase() : null;
}

export function hexToRgb(hex: string): Rgb {
  const v = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Colore CSS calcolato → rgb e alpha. Accetta "#rrggbb", "rgb()/rgba()" (virgole o spazi) e
 * "color(srgb r g b / a)" (quello che danno i color-mix); null se non si riconosce.
 */
export function parseCssColor(value: string): { rgb: Rgb; alpha: number } | null {
  const s = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return { rgb: hexToRgb(s), alpha: 1 };
  let m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: parseAlpha(m[4]) };
  m = s.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) return { rgb: [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255], alpha: parseAlpha(m[4]) };
  return null;
}

function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1;
  return raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
}

/** Luminanza relativa WCAG. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}

export interface ReadableColor {
  /** Colore da mostrare (#rrggbb). */
  color: string;
  /** True = è stato schiarito o scurito per la leggibilità. */
  adjusted: boolean;
}

/**
 * Il colore scelto, oppure lo stesso con la luminosità spostata quanto basta per arrivare a
 * `min` di contrasto sullo sfondo: più scuro su fondo chiaro, più chiaro su fondo scuro.
 */
export function readableTitleColor(color: string, background: Rgb, min: number): ReadableColor {
  const rgb = hexToRgb(color);
  if (contrastRatio(rgb, background) >= min) return { color: color.toLowerCase(), adjusted: false };
  const [h, s, l] = rgbToHsl(rgb);
  const darken = relativeLuminance(background) > 0.18;
  const target = darken ? 0 : 1;
  // Ricerca binaria della luminosità più vicina a quella scelta che basta.
  let ok = target;
  let lo = l;
  let hi = target;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(hslToRgb([h, s, mid]), background) >= min) {
      ok = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return { color: rgbToHex(hslToRgb([h, s, ok])), adjusted: true };
}
