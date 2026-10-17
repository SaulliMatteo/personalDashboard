import type { PeriodRange } from "../../../core/report/periods";
import type { NoteInPeriod, SavedVideo, VideoFolder, WatchSession } from "../data/youtubeRepository";
import { colorForFolder, rootFolderOf, videoProgress } from "./library";

/** Gruppi speciali del report (gli altri sono gli id delle cartelle di primo livello). */
export const NO_FOLDER_GROUP = -1;
export const DELETED_VIDEOS_GROUP = -2;

export interface ReportGroupRow {
  /** Id della cartella di primo livello, oppure NO_FOLDER_GROUP / DELETED_VIDEOS_GROUP. */
  groupId: number;
  name: string;
  color: string;
  /** Video distinti con tempo di visione nel periodo. */
  videos: number;
  seconds: number;
  /** Durata media dei video (la loro lunghezza), tra quelli con durata nota; null se nessuna. */
  avgDurationSeconds: number | null;
  /** 0..1: media dell'avanzamento dei video ancora presenti; null se non calcolabile. */
  completion: number | null;
  notes: number;
}

export interface VideoReport {
  totalSeconds: number;
  /** Variazione % rispetto al periodo precedente; null se prima non c'era nulla da confrontare. */
  deltaPercent: number | null;
  videosWatched: number;
  avgPerDaySeconds: number;
  notesCount: number;
  /** Ordinati per tempo di visione decrescente (a parità, per nome). */
  groups: ReportGroupRow[];
  total: ReportGroupRow;
}

/** Il gruppo di un video: cartella di primo livello attuale, "Senza cartella" o "eliminato". */
export function groupIdFor(
  folders: readonly VideoFolder[],
  folderId: number | null,
  videoExists: boolean
): number {
  if (!videoExists) return DELETED_VIDEOS_GROUP;
  return rootFolderOf(folders, folderId)?.id ?? NO_FOLDER_GROUP;
}

function groupMeta(folders: readonly VideoFolder[], groupId: number): { name: string; color: string } {
  if (groupId === NO_FOLDER_GROUP) return { name: "Senza cartella", color: "var(--text-muted)" };
  if (groupId === DELETED_VIDEOS_GROUP) return { name: "Video eliminati", color: "var(--text-muted)" };
  const folder = folders.find((f) => f.id === groupId);
  return { name: folder?.name ?? "Cartella eliminata", color: colorForFolder(folder) };
}

/** Variazione percentuale intera; null se il periodo precedente era a zero. */
export function percentChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Id del gruppo di ogni sessione (la query dà folderId e titolo null per i video eliminati). */
export function sessionGroupId(folders: readonly VideoFolder[], s: WatchSession): number {
  return groupIdFor(folders, s.folderId, s.videoTitle !== null);
}

export function buildVideoReport(input: {
  sessions: readonly WatchSession[];
  notes: readonly NoteInPeriod[];
  folders: readonly VideoFolder[];
  /** Tutti i video attuali (per durata e avanzamento). */
  videos: readonly SavedVideo[];
  previousSeconds: number;
  range: PeriodRange;
}): VideoReport {
  const { sessions, notes, folders, videos, previousSeconds, range } = input;
  const videoById = new Map(videos.map((v) => [v.id, v]));

  interface Acc {
    seconds: number;
    videoIds: Set<number>;
    notes: number;
  }
  const accs = new Map<number, Acc>();
  const acc = (id: number): Acc => {
    let a = accs.get(id);
    if (!a) accs.set(id, (a = { seconds: 0, videoIds: new Set(), notes: 0 }));
    return a;
  };

  const allVideoIds = new Set<number>();
  let totalSeconds = 0;
  for (const s of sessions) {
    const a = acc(sessionGroupId(folders, s));
    a.seconds += s.durationSeconds;
    a.videoIds.add(s.videoId);
    allVideoIds.add(s.videoId);
    totalSeconds += s.durationSeconds;
  }
  for (const n of notes) acc(groupIdFor(folders, n.folderId, true)).notes += 1;

  const stats = (ids: Iterable<number>) => {
    const durations: number[] = [];
    const completions: number[] = [];
    for (const id of ids) {
      const v = videoById.get(id);
      if (!v) continue; // eliminato: il tempo conta, durata e avanzamento no
      if (v.durationSeconds && v.durationSeconds > 0) durations.push(v.durationSeconds);
      if (v.watched || (v.durationSeconds && v.durationSeconds > 0)) completions.push(videoProgress(v));
    }
    const mean = (xs: number[]) => (xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : null);
    return { avgDurationSeconds: mean(durations), completion: mean(completions) };
  };

  const groups: ReportGroupRow[] = [...accs.entries()].map(([groupId, a]) => ({
    groupId,
    ...groupMeta(folders, groupId),
    videos: a.videoIds.size,
    seconds: a.seconds,
    ...stats(a.videoIds),
    notes: a.notes,
  }));
  groups.sort((x, y) => y.seconds - x.seconds || x.name.localeCompare(y.name, "it"));

  const notesCount = notes.length;
  const total: ReportGroupRow = {
    groupId: 0,
    name: "Totale",
    color: "var(--text-muted)",
    videos: allVideoIds.size,
    seconds: totalSeconds,
    ...stats(allVideoIds),
    notes: notesCount,
  };

  return {
    totalSeconds,
    deltaPercent: percentChange(totalSeconds, previousSeconds),
    videosWatched: allVideoIds.size,
    avgPerDaySeconds: range.elapsedDays > 0 ? totalSeconds / range.elapsedDays : 0,
    notesCount,
    groups,
    total,
  };
}

// ---------------------------------------------------------------------
// Scala del grafico
// ---------------------------------------------------------------------

const STEPS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 14400, 21600, 43200, 86400];

/**
 * Scala "tonda" per l'asse delle barre: passo scelto tra valori leggibili (minuti/ore),
 * massimo = multiplo del passo >= dei dati, al più `targetTicks` intervalli.
 * Senza dati: 15 minuti.
 */
export function niceScale(maxSeconds: number, targetTicks = 4): { max: number; step: number; ticks: number[] } {
  if (!(maxSeconds > 0)) return { max: 900, step: 900, ticks: [0, 900] };
  const step =
    STEPS.find((s) => Math.ceil(maxSeconds / s) <= targetTicks) ??
    Math.ceil(maxSeconds / targetTicks / 86400) * 86400;
  const intervals = Math.max(1, Math.ceil(maxSeconds / step));
  const max = intervals * step;
  return { max, step, ticks: Array.from({ length: intervals + 1 }, (_, i) => i * step) };
}
