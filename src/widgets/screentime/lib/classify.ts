import { classifyApp, processKey, type AppCategory } from "../../../core/system/appCategory";
import { appDisplayName } from "./appName";

/** Segmento come arriva da `screentime_take` (src-tauri/src/screen_time/segments.rs). */
export interface RawSegment {
  startMs: number;
  endMs: number;
  process: string;
  description: string;
  title: string;
  isSelf: boolean;
  idle: boolean;
}

/** Segmento pronto da contare: niente titolo. `counted` falso = "via dal PC". */
export interface ClassifiedSegment {
  startMs: number;
  endMs: number;
  appKey: string;
  appLabel: string;
  /** Categoria automatica (le scelte a mano si applicano leggendo: `effectiveCategory`). */
  category: AppCategory;
  counted: boolean;
}

/** La dashboard stessa: il processo cambia nome tra sviluppo e app installata. */
export const SELF_KEY = "__self";
export const SELF_LABEL = "personalDashboard";

/** Schermata di blocco o nessuna finestra: via dal PC anche se qualcuno muove il mouse. */
const AWAY_KEYS = new Set(["", "lockapp", "logonui", "loginwindow", "screensaverengine"]);

/** Senza toccare nulla si può stare davanti a un video, alla musica o in chiamata: quel tempo conta lo stesso. */
function countsWhileIdle(category: AppCategory, appId: string | null): boolean {
  return category === "video" || category === "music" || appId === "call";
}

const NO_CHOICES: ReadonlyMap<string, AppCategory> = new Map();

export function classifySegment(seg: RawSegment): ClassifiedSegment {
  const key = processKey(seg.process);
  if (seg.isSelf) {
    return { startMs: seg.startMs, endMs: seg.endMs, appKey: SELF_KEY, appLabel: SELF_LABEL, category: "other", counted: !seg.idle };
  }
  const auto = classifyApp(seg.process, seg.description, seg.title, NO_CHOICES);
  // Un browser conta come app, sempre "Browser": i siti non si contano (scelta dell'utente). Il titolo serve solo a
  // classifyApp (es. una chiamata nel browser), e non esce da qui.
  const category = BROWSER_KEYS.has(key) ? "browser" : auto.category;
  const counted = !AWAY_KEYS.has(key) && (!seg.idle || countsWhileIdle(category, auto.appId));
  return {
    startMs: seg.startMs,
    endMs: seg.endMs,
    appKey: key || "sconosciuta",
    appLabel: appDisplayName(key, seg.description),
    category,
    counted,
  };
}

/**
 * I browser noti: contano sempre come "Browser", anche quando per Pixy il titolo ne cambia la categoria (es. YouTube
 * = video). Le migrazioni 29 e 30 hanno unito così le righe vecchie con i siti.
 */
export const BROWSER_KEYS: ReadonlySet<string> = new Set([
  "chrome", "msedge", "firefox", "opera", "opera_gx", "opera gx", "brave", "vivaldi", "arc", "zen", "librewolf", "waterfox",
  "chromium", "safari", "google chrome", "microsoft edge", "brave browser",
]);

/**
 * Categoria di una riga salvata, con la scelta a mano dell'app (la stessa che usa Pixy). Così cambiare categoria vale
 * anche per i giorni passati.
 */
export function effectiveCategory(row: { appKey: string; category: string }, manual: ReadonlyMap<string, AppCategory>): AppCategory {
  return manual.get(row.appKey) ?? (row.category as AppCategory);
}
