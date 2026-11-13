import { classifyApp, processKey, type AppCategory } from "../../../core/system/appCategory";
import { appDisplayName } from "./appName";
import { siteFromTitle } from "./siteFromTitle";

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
  /** Nome del sito ('' fuori dal browser). */
  site: string;
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
    return { startMs: seg.startMs, endMs: seg.endMs, appKey: SELF_KEY, appLabel: SELF_LABEL, site: "", category: "other", counted: !seg.idle };
  }
  const auto = classifyApp(seg.process, seg.description, seg.title, NO_CHOICES);
  const isBrowser = auto.category === "browser" || BROWSER_KEYS.has(key);
  let site = "";
  let category = auto.category;
  if (isBrowser && seg.title.trim() !== "") {
    const match = siteFromTitle(seg.title, key);
    site = match.site;
    category = match.category ?? auto.category;
  }
  const counted = !AWAY_KEYS.has(key) && (!seg.idle || countsWhileIdle(category, auto.appId));
  return {
    startMs: seg.startMs,
    endMs: seg.endMs,
    appKey: key || "sconosciuta",
    appLabel: appDisplayName(key, seg.description),
    site,
    category,
    counted,
  };
}

/** I browser noti (anche quando il titolo ha già fatto cambiare categoria all'app, es. YouTube = video). */
const BROWSER_KEYS = new Set([
  "chrome", "msedge", "firefox", "opera", "opera_gx", "opera gx", "brave", "vivaldi", "arc", "zen", "librewolf", "waterfox",
  "chromium", "safari", "google chrome", "microsoft edge", "brave browser",
]);

/** Chiave delle scelte manuali per un sito, nella stessa impostazione delle app (`companionAppCategories`). */
export function siteChoiceKey(site: string): string {
  return `web:${site.toLowerCase().replace(/[;=]/g, "")}`;
}

/**
 * Categoria di una riga salvata, con le scelte a mano: per i siti vale quella del sito, per le app quella dell'app
 * (la stessa che usa Pixy). Così cambiare categoria vale anche per i giorni passati.
 */
export function effectiveCategory(row: { appKey: string; site: string; category: string }, manual: ReadonlyMap<string, AppCategory>): AppCategory {
  const chosen = row.site ? manual.get(siteChoiceKey(row.site)) : manual.get(row.appKey);
  return chosen ?? (row.category as AppCategory);
}
