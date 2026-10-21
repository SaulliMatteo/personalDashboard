/**
 * UNICA fonte di verità delle impostazioni.
 *
 * Per aggiungerne una:
 *  1. aggiungi la chiave con il valore di default in DEFAULT_SETTINGS;
 *  2. aggiungi una voce in SETTING_DEFS (gruppo, sezione, etichetta, tipo):
 *     compare da sola dove renderizzi quel gruppo con <SettingsSection>;
 *  3. leggila con useSettings() dove serve.
 * Nessuna migrazione DB: i valori sono righe chiave/valore e le chiavi
 * mancanti ricadono sul default.
 *
 * Gruppi: general/appearance/glow/dashboard non hanno più una scheda nel
 * modale Settings (che ora contiene solo la gestione widget): le chiavi
 * restano con i loro default e continuano a governare l'app. Il gruppo
 * "study" e "youtube" si modificano dalla rotellina del widget nel catalogo
 * (ogni widget dichiara il suo gruppo con `settingsGroup`).
 *
 * Raggi, spaziature, font e larghezza della sidebar li decide il tema
 * (styles/tokens.css): non sono più impostazioni.
 */

import { THEMES, THEME_IDS, isThemeId, type ThemeId } from "../theme/themes";

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
  theme: "notte" as ThemeId,
  /** false = si usa l'accent del tema; true = si usa accentColor. */
  accentOverride: false,
  accentColor: "#8EA6FF",
  sidebarPosition: "left" as "left" | "right",
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
  dashboardGreeting: "time" as "welcome" | "time" | "off",
  // Spazi in alto a destra dell'intestazione: "auto" = come il mockup del tema,
  // "none" = vuoto, altrimenti l'id di un widget con `mini` (vedi features/dashboard/HeaderSlots).
  headerSlot1: "auto",
  headerSlot2: "none",
  gridRows: 4,
  lockLayout: false,
  gridPushDelayMs: 600,
  dragThreshold: 3,
  openDetailOnClick: true,
  showDragGhost: true,
  ghostOpacity: 0.45,
  ghostBlur: 1.5,

  // ---- Widget: Studio ----
  pomodoroWorkMinutes: 25,
  pomodoroShortBreakMinutes: 5,
  pomodoroLongBreakMinutes: 15,
  pomodoroCyclesBeforeLongBreak: 4,
  studyAutoStartNext: true,
  studyDefaultMode: "pomodoro" as "pomodoro" | "stopwatch",
  studySoundEnabled: true,
  studyVolume: 50,
  studyNotificationsEnabled: true,
  studyStopwatchLapMinutes: 60,
  studyDailyGoalMinutes: 0,
  studyMinLoggableSeconds: 10,
  studyBreakColor: "#f5a35c",
  studyShowSubjectsInWidget: true,

  // ---- Widget: YouTube ----
  youtubeCountAsStudy: false,

  // ---- Widget: Companion ----
  companionName: "Pixel",
  companionPersonality: "cheerful" as "cheerful" | "calm" | "sleepy" | "grumpy",
  companionColor: "text" as "text" | "accent",
  companionShowMouth: true,
  companionBubbles: true,
  companionBubbleRate: "normal" as "rare" | "normal" | "often",
  companionRandomEmotes: true,
  companionEmoteRate: "normal" as "rare" | "normal" | "often",
  companionIdleMinutes: 5,
  companionWatchForegroundApp: true,
  /** Animazioni spente, "id,id,…". Si modifica dalla pagina del Companion: nessuna voce in SETTING_DEFS. */
  companionDisabledAnimations: "",

  // ---- Widget: Meteo ----
  /** Vuota = meteo spento: nessuna richiesta in rete. */
  weatherCity: "",
};

export type AppSettings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof AppSettings;
export type SettingsGroup = "general" | "appearance" | "glow" | "dashboard" | "study" | "youtube" | "companion" | "weather";

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
    options: THEME_IDS.map((id) => ({ value: id, label: THEMES[id].label })),
  },
  { key: "accentOverride", group: "appearance", section: "Tema e colori", type: "boolean", label: "Colore accent personalizzato", description: "Spento: si usa l'accent del tema." },
  { key: "accentColor", group: "appearance", section: "Tema e colori", type: "color", dependsOn: "accentOverride", label: "Colore accent", description: "Usato per selezioni, pulsanti e anelli di progresso." },

  { key: "sidebarPosition", group: "appearance", section: "Barra laterale", type: "select", label: "Posizione", options: [{ value: "left", label: "Sinistra" }, { value: "right", label: "Destra" }] },
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
    options: [{ value: "time", label: "In base all'ora del giorno" }, { value: "welcome", label: "Ciao" }, { value: "off", label: "Nessuno (titolo «Dashboard»)" }],
  },
  // Le opzioni vengono dal registry dei widget (che core non conosce): la scheda Dashboard
  // le mostra come select con SettingsField; qui basta la validazione da testo.
  { key: "headerSlot1", group: "dashboard", section: "Intestazione", type: "text", maxLength: 40, dependsOn: "showDashboardHeader", label: "Spazio in alto a destra", description: "Un mini widget accanto al saluto." },
  { key: "headerSlot2", group: "dashboard", section: "Intestazione", type: "text", maxLength: 40, dependsOn: "showDashboardHeader", label: "Secondo spazio", description: "Un altro mini widget, affiancato al primo." },

  { key: "gridRows", group: "dashboard", section: "Griglia", type: "number", control: "slider", min: 4, max: 8, step: 1, label: "Righe disponibili", description: "Più righe = più spazio per i widget. Non scende mai sotto le righe già occupate." },

  { key: "lockLayout", group: "dashboard", section: "Trascinamento", type: "boolean", label: "Blocca layout", description: "Impedisce di trascinare i widget." },
  { key: "gridPushDelayMs", group: "dashboard", section: "Trascinamento", type: "number", control: "slider", min: 0, max: 1500, step: 50, unit: "ms", label: "Ritardo spinta widget", description: "Quanto tieni un widget sopra un altro prima che lo sposti." },
  { key: "dragThreshold", group: "dashboard", section: "Trascinamento", type: "number", control: "slider", min: 0, max: 20, step: 1, unit: "px", label: "Distanza prima che parta il trascinamento", description: "Evita trascinamenti involontari quando clicchi." },
  { key: "openDetailOnClick", group: "dashboard", section: "Trascinamento", type: "boolean", label: "Apri il dettaglio con un doppio click sul widget" },

  { key: "showDragGhost", group: "dashboard", section: "Anteprima di spostamento", type: "boolean", label: "Mostra l'anteprima fantasma", description: "La copia sfocata che indica dove atterrerà il widget." },
  { key: "ghostOpacity", group: "dashboard", section: "Anteprima di spostamento", type: "number", control: "slider", min: 0.15, max: 0.8, step: 0.05, dependsOn: "showDragGhost", label: "Opacità" },
  { key: "ghostBlur", group: "dashboard", section: "Anteprima di spostamento", type: "number", control: "slider", min: 0, max: 6, step: 0.5, unit: "px", dependsOn: "showDragGhost", label: "Sfocatura" },

  // ======================= WIDGET: STUDIO =======================
  // Le durate qui sotto sono i valori PREDEFINITI delle nuove materie:
  // ogni materia può poi avere i propri (icona ingranaggio nella pagina Studio).
  { key: "studyDefaultMode", group: "study", section: "Nuove materie", type: "select", label: "Modalità predefinita", options: [{ value: "pomodoro", label: "Pomodoro" }, { value: "stopwatch", label: "Cronometro" }] },
  { key: "pomodoroWorkMinutes", group: "study", section: "Nuove materie", type: "number", control: "input", min: 1, max: 180, step: 1, label: "Lavoro (min)" },
  { key: "pomodoroShortBreakMinutes", group: "study", section: "Nuove materie", type: "number", control: "input", min: 1, max: 60, step: 1, label: "Pausa breve (min)" },
  { key: "pomodoroLongBreakMinutes", group: "study", section: "Nuove materie", type: "number", control: "input", min: 1, max: 120, step: 1, label: "Pausa lunga (min)" },
  { key: "pomodoroCyclesBeforeLongBreak", group: "study", section: "Nuove materie", type: "number", control: "input", min: 1, max: 12, step: 1, label: "Cicli prima della pausa lunga", description: "Valgono solo per le materie create da ora in poi." },

  { key: "studyAutoStartNext", group: "study", section: "Timer", type: "boolean", label: "Avvia in automatico la fase successiva", description: "Solo pomodoro. Se spento, a fine fase il timer si ferma e aspetta che premi play." },
  { key: "studyStopwatchLapMinutes", group: "study", section: "Timer", type: "number", control: "input", min: 1, max: 240, step: 1, label: "Giro dell'anello del cronometro (min)", description: "Ogni quanti minuti l'anello del cronometro compie un giro." },

  { key: "studySoundEnabled", group: "study", section: "Suoni e notifiche", type: "boolean", label: "Suono a fine fase" },
  { key: "studyVolume", group: "study", section: "Suoni e notifiche", type: "number", control: "slider", min: 5, max: 100, step: 5, unit: "%", dependsOn: "studySoundEnabled", label: "Volume" },
  { key: "studyNotificationsEnabled", group: "study", section: "Suoni e notifiche", type: "boolean", label: "Notifica di sistema a fine fase" },

  { key: "studyDailyGoalMinutes", group: "study", section: "Obiettivi e registrazione", type: "number", control: "input", min: 0, max: 720, step: 5, label: "Obiettivo giornaliero (min)", description: "0 = nessun obiettivo. Se impostato compare una barra di avanzamento." },
  { key: "studyMinLoggableSeconds", group: "study", section: "Obiettivi e registrazione", type: "number", control: "input", min: 1, max: 300, step: 1, label: "Durata minima da registrare (sec)", description: "Le sessioni più brevi vengono scartate (avvii accidentali)." },

  { key: "studyBreakColor", group: "study", section: "Aspetto", type: "color", label: "Colore delle pause" },
  { key: "studyShowSubjectsInWidget", group: "study", section: "Aspetto", type: "boolean", label: "Mostra le materie nel widget grande" },

  // ======================= WIDGET: YOUTUBE =======================
  {
    key: "youtubeCountAsStudy", group: "youtube", section: "Collegamento con lo Studio", type: "boolean",
    label: "Conta i video come tempo di studio",
    description:
      "Mentre guardi un video, il tempo in riproduzione si aggiunge allo studio della materia che ha lo stesso nome della cartella in cui il video è salvato (solo la cartella diretta; maiuscole e accenti non contano). Non conta se nessuna materia attiva ha quel nome, né mentre il timer dello Studio sta lavorando.",
  },

  // ======================= WIDGET: METEO =======================
  {
    key: "weatherCity", group: "weather", section: "Località", type: "text", maxLength: 60, placeholder: "Es. Milano", label: "Città",
    description: "Il meteo usa internet (Open-Meteo, gratuito e senza account) solo se il widget o il suo mini sono in uso e la città è impostata.",
  },

  // ======================= WIDGET: COMPANION =======================
  // Personalità e animazioni singole si scelgono anche dalla pagina del Companion.
  { key: "companionName", group: "companion", section: "Aspetto", type: "text", maxLength: 16, placeholder: "Pixel", label: "Nome" },
  {
    key: "companionPersonality", group: "companion", section: "Aspetto", type: "select", label: "Personalità",
    options: [
      { value: "cheerful", label: "Allegro" },
      { value: "calm", label: "Calmo" },
      { value: "sleepy", label: "Dormiglione" },
      { value: "grumpy", label: "Brontolone" },
    ],
  },
  { key: "companionColor", group: "companion", section: "Aspetto", type: "select", label: "Colore della faccia", options: [{ value: "text", label: "Quello del tema" }, { value: "accent", label: "Colore accent" }] },
  { key: "companionShowMouth", group: "companion", section: "Aspetto", type: "boolean", label: "Mostra la bocca" },

  { key: "companionBubbles", group: "companion", section: "Fumetti ed emozioni", type: "boolean", label: "Fumetti", description: "Frasi brevi quando succede qualcosa o, ogni tanto, spontanee." },
  {
    key: "companionBubbleRate", group: "companion", section: "Fumetti ed emozioni", type: "select", dependsOn: "companionBubbles", label: "Quanto chiacchiera",
    options: [{ value: "rare", label: "Poco" }, { value: "normal", label: "Normale" }, { value: "often", label: "Tanto" }],
  },
  { key: "companionRandomEmotes", group: "companion", section: "Fumetti ed emozioni", type: "boolean", label: "Emozioni casuali" },
  {
    key: "companionEmoteRate", group: "companion", section: "Fumetti ed emozioni", type: "select", dependsOn: "companionRandomEmotes", label: "Frequenza delle emozioni",
    options: [{ value: "rare", label: "Rara" }, { value: "normal", label: "Normale" }, { value: "often", label: "Frequente" }],
  },

  { key: "companionIdleMinutes", group: "companion", section: "Comportamento", type: "number", control: "input", min: 1, max: 120, step: 1, label: "Si addormenta dopo (min)", description: "Minuti senza mouse e tastiera. Non dorme mentre studi o guardi un video." },
  {
    key: "companionWatchForegroundApp", group: "companion", section: "Comportamento", type: "boolean",
    label: "Osserva l'app in primo piano (Windows)",
    description: "Legge nome e titolo della finestra attiva per capire se stai ascoltando musica, programmando o guardando un video. Tutto resta sul PC: niente viene salvato né inviato.",
  },
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
  const converted = convertLegacySettings(raw);
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    if (key in converted && isValidSetting(key, converted[key])) result[key] = converted[key];
  }
  return result as AppSettings;
}

/** Vecchi valori del tema (prima dei 4 temi) -> tema nuovo, così l'utente non perde la scelta. */
const LEGACY_THEMES: Record<string, ThemeId> = { dark: "notte", light: "quaderno", system: "notte" };

/**
 * Converte i valori salvati da versioni precedenti PRIMA della validazione
 * (che altrimenti li scarterebbe facendoli tornare al default).
 */
function convertLegacySettings(raw: Record<string, unknown>): Record<string, unknown> {
  const theme = raw.theme;
  if (typeof theme !== "string" || isThemeId(theme)) return raw;
  const mapped = LEGACY_THEMES[theme];
  return mapped ? { ...raw, theme: mapped } : raw;
}
