/**
 * UNICA fonte di verità delle impostazioni.
 *
 * Per aggiungerne una:
 *  1. aggiungi la chiave con il valore di default in DEFAULT_SETTINGS;
 *  2. aggiungi una voce in SETTING_DEFS (gruppo, sezione, etichetta, tipo):
 *     compare da sola nel pannello Settings (o dove renderizzi quel gruppo);
 *  3. leggila con useSettings() dove serve.
 * Nessuna migrazione DB: i valori sono righe chiave/valore e le chiavi
 * mancanti ricadono sul default.
 *
 * Gruppi = dove compaiono:
 *  general/appearance/glow/dashboard -> schede omonime del modale Settings
 *  weather/study                     -> scheda "Widgets" (ogni widget dichiara
 *                                       il suo gruppo con `settingsGroup`)
 */

/** Palette del glow dei widget: tre colori usati per il bordo "mesh". */
export const GLOW_PALETTES = {
  aurora: { label: "Aurora", colors: ["#c084fc", "#f472b6", "#38bdf8"] },
  sunset: { label: "Tramonto", colors: ["#fb923c", "#f43f5e", "#facc15"] },
  ocean: { label: "Oceano", colors: ["#22d3ee", "#3b82f6", "#a78bfa"] },
  forest: { label: "Foresta", colors: ["#4ade80", "#22c55e", "#a3e635"] },
  mono: { label: "Monocromatica", colors: ["#e5e7eb", "#9ca3af", "#f9fafb"] },
} as const;

export type GlowPaletteKey = keyof typeof GLOW_PALETTES | "accent";

export const DEFAULT_SETTINGS = {
  // ---- Generale ----
  userName: "",
  dashboardName: "Personal Dashboard",

  // ---- Aspetto ----
  theme: "dark" as "dark" | "light" | "system",
  accentColor: "#6c8dff",
  cardRadius: 14,
  itemRadius: 8,
  widgetPadding: 16,
  fontFamily: "default" as "default" | "system" | "serif" | "mono",
  sidebarPosition: "left" as "left" | "right",
  sidebarWidth: 240,
  sidebarShowTitle: true,
  animationsEnabled: true,

  // ---- Effetti (glow) ----
  glowEnabled: true,
  glowSweepOnLoad: true,
  glowPalette: "aurora" as GlowPaletteKey,
  glowHue: 40,
  glowIntensity: 0.7,
  glowRadius: 33,
  glowEdgeSensitivity: 24,
  glowConeSpread: 25,
  glowFillOpacity: 0.5,

  // ---- Dashboard ----
  showDashboardHeader: true,
  dashboardGreeting: "welcome" as "welcome" | "time" | "off",
  gridMargin: 10,
  gridRowHeightRatio: 0.5,
  gridRows: 4,
  lockLayout: false,
  gridPushDelayMs: 600,
  dragThreshold: 3,
  openDetailOnClick: true,
  showDragGhost: true,
  ghostOpacity: 0.45,
  ghostBlur: 1.5,

  // ---- Widget: Meteo ----
  weatherCity: "Spoleto",
  weatherUnit: "c" as "c" | "f",

  // ---- Widget: Studio ----
  pomodoroWorkMinutes: 25,
  pomodoroShortBreakMinutes: 5,
  pomodoroLongBreakMinutes: 15,
  pomodoroCyclesBeforeLongBreak: 4,
  studyAutoStartNext: true,
  studySoundEnabled: true,
  studyVolume: 50,
  studyDailyGoalMinutes: 0,
  studyMinLoggableSeconds: 10,
  studyBreakColor: "#f5a35c",
  studyShowSubjectsInWidget: true,
};

export type AppSettings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof AppSettings;
export type SettingsGroup = "general" | "appearance" | "glow" | "dashboard" | "weather" | "study";

interface BaseDef {
  key: SettingKey;
  group: SettingsGroup;
  /** Titoletto sotto cui il campo viene raggruppato (ordine = prima apparizione). */
  section: string;
  label: string;
  description?: string;
  /** Chiave booleana da cui dipende: se è false il campo resta visibile ma disattivato. */
  dependsOn?: SettingKey;
}

export type SettingDef = BaseDef &
  (
    | { type: "boolean" }
    | { type: "number"; min: number; max: number; step: number; unit?: string; control?: "slider" | "input" }
    | { type: "select"; options: { value: string; label: string }[] }
    | { type: "color" }
    | { type: "text"; maxLength: number; placeholder?: string }
  );

const GLOW_PALETTE_OPTIONS = [
  ...Object.entries(GLOW_PALETTES).map(([value, p]) => ({ value, label: p.label })),
  { value: "accent", label: "Colore accent" },
];

export const SETTING_DEFS: SettingDef[] = [
  // ======================= GENERALE =======================
  { key: "userName", group: "general", section: "Personalizzazione", type: "text", maxLength: 30, placeholder: "Il tuo nome", label: "Il tuo nome", description: "Usato nel saluto della dashboard." },
  { key: "dashboardName", group: "general", section: "Personalizzazione", type: "text", maxLength: 30, placeholder: "Personal Dashboard", label: "Titolo dell'app", description: "Mostrato in cima alla barra laterale." },

  // ======================= ASPETTO =======================
  {
    key: "theme", group: "appearance", section: "Tema e colori", type: "select", label: "Tema",
    options: [{ value: "dark", label: "Scuro" }, { value: "light", label: "Chiaro" }, { value: "system", label: "Segui il sistema" }],
  },
  { key: "accentColor", group: "appearance", section: "Tema e colori", type: "color", label: "Colore accent", description: "Usato per selezioni, pulsanti e anelli di progresso." },

  { key: "cardRadius", group: "appearance", section: "Forma e spaziatura", type: "number", control: "slider", min: 0, max: 28, step: 1, unit: "px", label: "Arrotondamento widget" },
  { key: "itemRadius", group: "appearance", section: "Forma e spaziatura", type: "number", control: "slider", min: 0, max: 16, step: 1, unit: "px", label: "Arrotondamento pulsanti e campi" },
  { key: "widgetPadding", group: "appearance", section: "Forma e spaziatura", type: "number", control: "slider", min: 8, max: 28, step: 1, unit: "px", label: "Spazio interno dei widget" },

  {
    key: "fontFamily", group: "appearance", section: "Tipografia", type: "select", label: "Carattere",
    options: [
      { value: "default", label: "Inter (predefinito)" },
      { value: "system", label: "Carattere di sistema" },
      { value: "serif", label: "Serif" },
      { value: "mono", label: "Monospazio" },
    ],
  },

  { key: "sidebarPosition", group: "appearance", section: "Barra laterale", type: "select", label: "Posizione", options: [{ value: "left", label: "Sinistra" }, { value: "right", label: "Destra" }] },
  { key: "sidebarWidth", group: "appearance", section: "Barra laterale", type: "number", control: "slider", min: 180, max: 320, step: 10, unit: "px", label: "Larghezza" },
  { key: "sidebarShowTitle", group: "appearance", section: "Barra laterale", type: "boolean", label: "Mostra il titolo dell'app" },

  { key: "animationsEnabled", group: "appearance", section: "Movimento", type: "boolean", label: "Animazioni", description: "Disattivandole si spengono transizioni e sweep del glow." },

  // ======================= EFFETTI (GLOW) =======================
  { key: "glowEnabled", group: "glow", section: "Glow dei widget", type: "boolean", label: "Effetto glow sui widget", description: "Il bordo luminoso che segue il mouse." },
  { key: "glowSweepOnLoad", group: "glow", section: "Glow dei widget", type: "boolean", dependsOn: "glowEnabled", label: "Animazione iniziale", description: "Un giro di luce quando il widget compare." },

  { key: "glowPalette", group: "glow", section: "Colori", type: "select", dependsOn: "glowEnabled", label: "Palette del bordo", options: GLOW_PALETTE_OPTIONS },
  { key: "glowHue", group: "glow", section: "Colori", type: "number", control: "slider", min: 0, max: 360, step: 5, unit: "°", dependsOn: "glowEnabled", label: "Tinta dell'alone esterno" },

  { key: "glowIntensity", group: "glow", section: "Intensità e forma", type: "number", control: "slider", min: 0.1, max: 1, step: 0.05, dependsOn: "glowEnabled", label: "Intensità" },
  { key: "glowRadius", group: "glow", section: "Intensità e forma", type: "number", control: "slider", min: 0, max: 60, step: 1, unit: "px", dependsOn: "glowEnabled", label: "Raggio" },
  { key: "glowEdgeSensitivity", group: "glow", section: "Intensità e forma", type: "number", control: "slider", min: 5, max: 45, step: 1, dependsOn: "glowEnabled", label: "Sensibilità al bordo", description: "Valori alti: il glow si accende solo con il mouse molto vicino al bordo. Valori bassi: si accende da più lontano." },
  { key: "glowConeSpread", group: "glow", section: "Intensità e forma", type: "number", control: "slider", min: 10, max: 45, step: 1, dependsOn: "glowEnabled", label: "Ampiezza del cono" },
  { key: "glowFillOpacity", group: "glow", section: "Intensità e forma", type: "number", control: "slider", min: 0, max: 1, step: 0.05, dependsOn: "glowEnabled", label: "Riempimento vicino ai bordi" },

  // ======================= DASHBOARD =======================
  { key: "showDashboardHeader", group: "dashboard", section: "Intestazione", type: "boolean", label: "Mostra l'intestazione" },
  {
    key: "dashboardGreeting", group: "dashboard", section: "Intestazione", type: "select", dependsOn: "showDashboardHeader", label: "Saluto",
    options: [{ value: "welcome", label: "Welcome back" }, { value: "time", label: "In base all'ora del giorno" }, { value: "off", label: "Nessuno" }],
  },

  { key: "gridMargin", group: "dashboard", section: "Griglia", type: "number", control: "slider", min: 0, max: 40, step: 1, unit: "px", label: "Margine tra i widget" },
  { key: "gridRowHeightRatio", group: "dashboard", section: "Griglia", type: "number", control: "slider", min: 0.3, max: 1, step: 0.05, label: "Altezza righe", description: "Rapporto tra altezza di riga e larghezza di colonna. 1 = celle quadrate." },
  { key: "gridRows", group: "dashboard", section: "Griglia", type: "number", control: "slider", min: 4, max: 8, step: 1, label: "Righe disponibili", description: "Più righe = più spazio per i widget. Non scende mai sotto le righe già occupate." },

  { key: "lockLayout", group: "dashboard", section: "Trascinamento", type: "boolean", label: "Blocca layout", description: "Impedisce di trascinare i widget." },
  { key: "gridPushDelayMs", group: "dashboard", section: "Trascinamento", type: "number", control: "slider", min: 0, max: 1500, step: 50, unit: "ms", label: "Ritardo spinta widget", description: "Quanto tieni un widget sopra un altro prima che lo sposti." },
  { key: "dragThreshold", group: "dashboard", section: "Trascinamento", type: "number", control: "slider", min: 0, max: 20, step: 1, unit: "px", label: "Distanza prima che parta il trascinamento", description: "Evita trascinamenti involontari quando clicchi." },
  { key: "openDetailOnClick", group: "dashboard", section: "Trascinamento", type: "boolean", label: "Apri i dettagli con un click sul widget" },

  { key: "showDragGhost", group: "dashboard", section: "Anteprima di spostamento", type: "boolean", label: "Mostra l'anteprima fantasma", description: "La copia sfocata che indica dove atterrerà il widget." },
  { key: "ghostOpacity", group: "dashboard", section: "Anteprima di spostamento", type: "number", control: "slider", min: 0.15, max: 0.8, step: 0.05, dependsOn: "showDragGhost", label: "Opacità" },
  { key: "ghostBlur", group: "dashboard", section: "Anteprima di spostamento", type: "number", control: "slider", min: 0, max: 6, step: 0.5, unit: "px", dependsOn: "showDragGhost", label: "Sfocatura" },

  // ======================= WIDGET: METEO =======================
  { key: "weatherCity", group: "weather", section: "Località", type: "text", maxLength: 40, placeholder: "Città", label: "Città mostrata" },
  { key: "weatherUnit", group: "weather", section: "Località", type: "select", label: "Unità di temperatura", options: [{ value: "c", label: "Celsius (°C)" }, { value: "f", label: "Fahrenheit (°F)" }] },

  // ======================= WIDGET: STUDIO =======================
  { key: "pomodoroWorkMinutes", group: "study", section: "Pomodoro", type: "number", control: "input", min: 1, max: 180, step: 1, label: "Lavoro (min)" },
  { key: "pomodoroShortBreakMinutes", group: "study", section: "Pomodoro", type: "number", control: "input", min: 1, max: 60, step: 1, label: "Pausa breve (min)" },
  { key: "pomodoroLongBreakMinutes", group: "study", section: "Pomodoro", type: "number", control: "input", min: 1, max: 120, step: 1, label: "Pausa lunga (min)" },
  { key: "pomodoroCyclesBeforeLongBreak", group: "study", section: "Pomodoro", type: "number", control: "input", min: 1, max: 12, step: 1, label: "Cicli prima della pausa lunga" },
  { key: "studyAutoStartNext", group: "study", section: "Pomodoro", type: "boolean", label: "Avvia in automatico la fase successiva", description: "Se spento, a fine fase il timer si ferma e aspetta che premi play." },

  { key: "studySoundEnabled", group: "study", section: "Suoni", type: "boolean", label: "Suono a fine fase" },
  { key: "studyVolume", group: "study", section: "Suoni", type: "number", control: "slider", min: 5, max: 100, step: 5, unit: "%", dependsOn: "studySoundEnabled", label: "Volume" },

  { key: "studyDailyGoalMinutes", group: "study", section: "Obiettivi e registrazione", type: "number", control: "input", min: 0, max: 720, step: 5, label: "Obiettivo giornaliero (min)", description: "0 = nessun obiettivo. Se impostato compare una barra di avanzamento." },
  { key: "studyMinLoggableSeconds", group: "study", section: "Obiettivi e registrazione", type: "number", control: "input", min: 1, max: 300, step: 1, label: "Durata minima da registrare (sec)", description: "Le sessioni più brevi vengono scartate (avvii accidentali)." },

  { key: "studyBreakColor", group: "study", section: "Aspetto", type: "color", label: "Colore delle pause" },
  { key: "studyShowSubjectsInWidget", group: "study", section: "Aspetto", type: "boolean", label: "Mostra le materie nel widget grande" },
];

const DEFS_BY_KEY = new Map<SettingKey, SettingDef>(SETTING_DEFS.map((d) => [d.key, d]));

/** True se `value` è ammesso per `key` (tipo, intervallo, opzioni, lunghezza). */
export function isValidSetting(key: SettingKey, value: unknown): boolean {
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
    case "text":
      return typeof value === "string" && value.length <= def.maxLength;
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
    if (key in raw && isValidSetting(key, raw[key])) result[key] = raw[key];
  }
  return result as AppSettings;
}
