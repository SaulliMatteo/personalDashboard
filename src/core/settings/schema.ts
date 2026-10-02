/**
 * UNICA fonte di verità delle impostazioni.
 *
 * Per aggiungerne una:
 *  1. aggiungi la chiave con il valore di default in DEFAULT_SETTINGS;
 *  2. aggiungi una voce in SETTING_DEFS (gruppo, etichetta, tipo di controllo):
 *     compare da sola nel pannello Settings (o dove renderizzi quel gruppo);
 *  3. leggila con useSettings() dove serve.
 * Nessuna migrazione DB: i valori sono righe chiave/valore e le chiavi
 * mancanti ricadono sul default.
 */
export const DEFAULT_SETTINGS = {
  // Aspetto
  theme: "dark" as "dark" | "light",
  accentColor: "#6c8dff",
  animationsEnabled: true,
  glowEnabled: true,
  glowIntensity: 0.7,
  glowRadius: 33,

  // Dashboard
  gridMargin: 10,
  gridRowHeightRatio: 0.5,
  gridPushDelayMs: 600,
  lockLayout: false,

  // Studio (pomodoro)
  pomodoroWorkMinutes: 25,
  pomodoroShortBreakMinutes: 5,
  pomodoroLongBreakMinutes: 15,
  pomodoroCyclesBeforeLongBreak: 4,
};

export type AppSettings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof AppSettings;
export type SettingsGroup = "appearance" | "dashboard" | "study";

interface BaseDef {
  key: SettingKey;
  group: SettingsGroup;
  label: string;
  description?: string;
}

export type SettingDef = BaseDef &
  (
    | { type: "boolean" }
    | { type: "number"; min: number; max: number; step: number; unit?: string; control?: "slider" | "input" }
    | { type: "select"; options: { value: string; label: string }[] }
    | { type: "color" }
  );

export const SETTING_DEFS: SettingDef[] = [
  // ---- Aspetto ----
  {
    key: "theme", group: "appearance", type: "select", label: "Tema",
    options: [{ value: "dark", label: "Scuro" }, { value: "light", label: "Chiaro" }],
  },
  { key: "accentColor", group: "appearance", type: "color", label: "Colore accent", description: "Usato per selezioni, pulsanti e anelli di progresso." },
  { key: "animationsEnabled", group: "appearance", type: "boolean", label: "Animazioni", description: "Disattivandole si spengono transizioni e sweep del glow." },
  { key: "glowEnabled", group: "appearance", type: "boolean", label: "Effetto glow sui widget" },
  { key: "glowIntensity", group: "appearance", type: "number", control: "slider", min: 0.1, max: 1, step: 0.05, label: "Intensità glow" },
  { key: "glowRadius", group: "appearance", type: "number", control: "slider", min: 0, max: 60, step: 1, unit: "px", label: "Raggio glow" },

  // ---- Dashboard ----
  { key: "gridMargin", group: "dashboard", type: "number", control: "slider", min: 0, max: 40, step: 1, unit: "px", label: "Margine griglia" },
  { key: "gridRowHeightRatio", group: "dashboard", type: "number", control: "slider", min: 0.3, max: 1, step: 0.05, label: "Altezza righe", description: "Rapporto tra altezza di riga e larghezza di colonna. 1 = celle quadrate." },
  { key: "gridPushDelayMs", group: "dashboard", type: "number", control: "slider", min: 0, max: 1500, step: 50, unit: "ms", label: "Ritardo spinta widget", description: "Quanto tieni un widget sopra un altro prima che lo sposti." },
  { key: "lockLayout", group: "dashboard", type: "boolean", label: "Blocca layout", description: "Impedisce di trascinare i widget." },

  // ---- Studio ----
  { key: "pomodoroWorkMinutes", group: "study", type: "number", control: "input", min: 1, max: 180, step: 1, label: "Lavoro (min)" },
  { key: "pomodoroShortBreakMinutes", group: "study", type: "number", control: "input", min: 1, max: 60, step: 1, label: "Pausa breve (min)" },
  { key: "pomodoroLongBreakMinutes", group: "study", type: "number", control: "input", min: 1, max: 120, step: 1, label: "Pausa lunga (min)" },
  { key: "pomodoroCyclesBeforeLongBreak", group: "study", type: "number", control: "input", min: 1, max: 12, step: 1, label: "Cicli prima della pausa lunga" },
];

const DEFS_BY_KEY = new Map<SettingKey, SettingDef>(SETTING_DEFS.map((d) => [d.key, d]));

function isValidValue(key: SettingKey, value: unknown): boolean {
  if (typeof value !== typeof DEFAULT_SETTINGS[key]) return false;
  const def = DEFS_BY_KEY.get(key);
  if (!def) return true;
  switch (def.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) && value >= def.min && value <= def.max;
    case "select":
      return def.options.some((o) => o.value === value);
    case "color":
      return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
    default:
      return true;
  }
}

/**
 * Prende i valori grezzi letti dal DB e ritorna impostazioni sempre valide:
 * chiavi sconosciute ignorate, valori di tipo/intervallo sbagliato sostituiti
 * dal default. Un DB parzialmente corrotto non può rompere l'app.
 */
export function sanitizeSettings(raw: Record<string, unknown>): AppSettings {
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    if (key in raw && isValidValue(key, raw[key])) result[key] = raw[key];
  }
  return result as AppSettings;
}
