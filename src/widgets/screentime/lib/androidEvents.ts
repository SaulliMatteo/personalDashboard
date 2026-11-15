/**
 * Dagli eventi di uso di Android (plugin usage-stats, src-tauri/plugins/usage-stats/) ai tratti di tempo per app.
 * Puro: gli eventi arrivano da fuori, già in ordine di tempo.
 *
 * Un'app conta da quando va in primo piano (tipo 1) a quando va in pausa (2), si spegne o si blocca lo schermo (3) o
 * un'altra app va in primo piano. Conta solo la pausa della schermata in primo piano: Android a volte manda quella di
 * una schermata vecchia (della stessa app o di un'altra) dopo l'arrivo della nuova, ed es. Chrome apre una schermata
 * di passaggio prima di quella delle schede. L'ultimo tratto ancora aperto non si conta:
 * la lettura successiva riparte dal suo inizio (`openSince`), così niente si conta due volte.
 */

/** Come arriva da `screentime_usage_events` (src-tauri/plugins/usage-stats/src/lib.rs). */
export interface PhoneEvents {
  /** [ms, tipo, indice in `packages`, schermata]: 1 = in primo piano, 2 = in pausa, 3 = schermo spento o bloccato
   *  (indici -1). La schermata è un numero per pacchetto + classe (il nome non arriva). */
  events: Array<[number, number, number, number]>;
  packages: PhonePackage[];
  /** Le app della schermata Home. */
  home: string[];
  /** Il pacchetto della dashboard. */
  self: string;
  /** Da quando Android ha ancora la cronologia (ms), se lo sa. */
  oldest?: number;
}

export interface PhonePackage {
  pkg: string;
  label?: string;
  /** `ApplicationInfo.category` di Android; -1 = non dichiarata. */
  category: number;
}

export interface PhoneSegment {
  startMs: number;
  endMs: number;
  pkg: string;
}

export const EVENT_FOREGROUND = 1;
export const EVENT_BACKGROUND = 2;
export const EVENT_SCREEN_OFF = 3;

/**
 * Tratti chiusi fino a `until` (gli eventi dopo si ignorano) e l'inizio di quello ancora aperto, da cui ripartire
 * alla prossima lettura (null = niente di aperto: si riparte da `until`).
 */
export function eventsToSegments(batch: PhoneEvents, until: number): { segments: PhoneSegment[]; openSince: number | null } {
  const segments: PhoneSegment[] = [];
  let cur = null as { pkg: string; screen: number; since: number } | null;
  for (const [at, type, index, screen] of batch.events) {
    if (at > until) break;
    const pkg = batch.packages[index]?.pkg;
    let ends = false;
    let starts: string | null = null;
    if (type === EVENT_FOREGROUND && pkg) {
      if (cur?.pkg === pkg) {
        cur.screen = screen; // un'altra schermata della stessa app: il tratto continua
        continue;
      }
      ends = true;
      starts = pkg;
    } else if (type === EVENT_BACKGROUND && pkg) {
      ends = cur?.pkg === pkg && cur.screen === screen;
    } else if (type === EVENT_SCREEN_OFF) {
      ends = true;
    }
    if (ends && cur) {
      if (at > cur.since) segments.push({ startMs: cur.since, endMs: at, pkg: cur.pkg });
      cur = null;
    }
    if (starts) cur = { pkg: starts, screen, since: at };
  }
  return { segments, openSince: cur ? cur.since : null };
}

/** I tratti persi: dalla lettura precedente a quando comincia la cronologia che Android ha ancora. null = nessuno. */
export function lostRange(cursor: number | null, oldest: number | undefined): { from: number; to: number } | null {
  // un'ora di margine: Android arrotonda l'inizio dei suoi giorni
  if (cursor === null || oldest === undefined || oldest - cursor < 3_600_000) return null;
  return { from: cursor, to: oldest };
}
