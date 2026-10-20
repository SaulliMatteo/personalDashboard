/**
 * I quattro temi dell'app. I colori NON stanno qui ma in `styles/tokens.css`
 * (un blocco `:root[data-theme="<id>"]` per tema): qui c'è solo ciò che serve
 * al codice (etichette, schema chiaro/scuro, glow, accent di default).
 *
 * Mockup di riferimento: `temi-dashboard/docs/design/temi/`.
 */

export const THEME_IDS = ["notte", "opaco", "quaderno", "fosforo"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeDef {
  id: ThemeId;
  label: string;
  /** "Scuro" / "Chiaro", mostrato accanto al nome nella scheda Aspetto. */
  schemeLabel: string;
  description: string;
  scheme: "dark" | "light";
  /** Accent del tema, usato quando l'utente non ha scelto "accentOverride". */
  defaultAccent: string;
  /** Bordo luminoso che segue il mouse: solo Notte. */
  glow: boolean;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  notte: {
    id: "notte",
    label: "Notte",
    schemeLabel: "Scuro",
    description: "Blu inchiostro, ghiera a tacche.",
    scheme: "dark",
    defaultAccent: "#8EA6FF",
    glow: true,
  },
  opaco: {
    id: "opaco",
    label: "Opaco",
    schemeLabel: "Chiaro",
    description: "Blocchi di colore pigmentato.",
    scheme: "light",
    defaultAccent: "#22251F",
    glow: false,
  },
  quaderno: {
    id: "quaderno",
    label: "Quaderno",
    schemeLabel: "Chiaro",
    description: "Foglio a quadretti, inchiostro blu.",
    scheme: "light",
    defaultAccent: "#2340A0",
    glow: false,
  },
  fosforo: {
    id: "fosforo",
    label: "Fosforo",
    schemeLabel: "Scuro",
    description: "Moduli hardware, display a punti.",
    scheme: "dark",
    defaultAccent: "#F4E9E4",
    glow: false,
  },
};

/** Accent proposti nella scheda Aspetto (dal mockup impostazioni-aspetto.html); "+" apre il selettore libero. */
export const ACCENT_PRESETS = [
  { label: "Lunare", color: "#8EA6FF" },
  { label: "Menta", color: "#7DD3B0" },
  { label: "Ambra", color: "#F0B47A" },
  { label: "Rosa", color: "#F29BC0" },
] as const;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

/**
 * Pigmenti del tema Opaco: ogni widget ha il suo colore di fondo fisso.
 * I valori stanno in tokens.css (`[data-pigment="<nome>"]`); i widget non
 * elencati ciclano sulla lista nell'ordine del registry.
 */
export const PIGMENTS = ["salvia", "blu", "senape", "malva", "carta"] as const;
export type Pigment = (typeof PIGMENTS)[number];

const PIGMENT_BY_WIDGET: Record<string, Pigment> = {
  study: "salvia",
  companion: "blu",
  filetransfer: "senape",
  youtube: "malva",
  notes: "carta",
};

/** Pigmento di un widget; `index` (posizione nel registry) serve solo per i widget nuovi. */
export function pigmentFor(widgetId: string, index: number): Pigment {
  return PIGMENT_BY_WIDGET[widgetId] ?? PIGMENTS[index % PIGMENTS.length];
}
