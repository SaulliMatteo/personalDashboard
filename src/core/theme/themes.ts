/**
 * I quattro temi dell'app, ognuno in due varianti (giorno / notte). I colori
 * NON stanno qui ma in `styles/tokens.css` (un blocco `:root[data-theme="<id>"]`
 * per la variante nativa) e `styles/tokens-varianti.css` (un blocco
 * `:root[data-theme="<id>"][data-mode="<variante>"]` per l'altra): qui c'è solo
 * ciò che serve al codice (etichette, schema chiaro/scuro, glow, accent di default).
 *
 * Mockup di riferimento: `docs/design/temi/`.
 */

export const THEME_IDS = ["notte", "opaco", "quaderno", "fosforo"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Variante di un tema: cambiano solo i colori, mai forme, font o componenti. */
export const THEME_MODES = ["giorno", "notte"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** Ciò che cambia tra le due varianti dello stesso tema. */
export interface ThemeModeDef {
  scheme: "dark" | "light";
  /** Accent della variante, usato quando l'utente non ne ha scelto uno per questa variante. */
  defaultAccent: string;
  /** Bordo luminoso che segue il mouse: solo Notte in versione notte. */
  glow: boolean;
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  description: string;
  /** La variante con cui il tema è nato (i blocchi di tokens.css). */
  nativeMode: ThemeMode;
  modes: Record<ThemeMode, ThemeModeDef>;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  notte: {
    id: "notte",
    label: "Notte",
    description: "Blu inchiostro, ghiera a tacche.",
    nativeMode: "notte",
    modes: {
      notte: { scheme: "dark", defaultAccent: "#8EA6FF", glow: true },
      giorno: { scheme: "light", defaultAccent: "#3B57D6", glow: false },
    },
  },
  opaco: {
    id: "opaco",
    label: "Opaco",
    description: "Blocchi di colore pigmentato.",
    nativeMode: "giorno",
    modes: {
      giorno: { scheme: "light", defaultAccent: "#22251F", glow: false },
      notte: { scheme: "dark", defaultAccent: "#ECE9E2", glow: false },
    },
  },
  quaderno: {
    id: "quaderno",
    label: "Quaderno",
    description: "Foglio a quadretti, inchiostro blu.",
    nativeMode: "giorno",
    modes: {
      giorno: { scheme: "light", defaultAccent: "#2340A0", glow: false },
      notte: { scheme: "dark", defaultAccent: "#9FB6FF", glow: false },
    },
  },
  fosforo: {
    id: "fosforo",
    label: "Fosforo",
    description: "Moduli hardware, display a punti.",
    nativeMode: "notte",
    modes: {
      notte: { scheme: "dark", defaultAccent: "#F4E9E4", glow: false },
      giorno: { scheme: "light", defaultAccent: "#2A1215", glow: false },
    },
  },
};

/** Variante effettiva: "auto" segue il sistema (`prefers-color-scheme`), senza mai cambiare tema. */
export function resolveMode(themeMode: ThemeMode | "auto", systemDark: boolean): ThemeMode {
  if (themeMode === "auto") return systemDark ? "notte" : "giorno";
  return themeMode;
}

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
  clock: "senape",
  date: "salvia",
  weather: "blu",
};

/** Pigmento di un widget; `index` (posizione nel registry) serve solo per i widget nuovi. */
export function pigmentFor(widgetId: string, index: number): Pigment {
  return PIGMENT_BY_WIDGET[widgetId] ?? PIGMENTS[index % PIGMENTS.length];
}
