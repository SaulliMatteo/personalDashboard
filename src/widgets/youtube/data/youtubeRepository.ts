import { getDatabase } from "../../../core/db";

// ---------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------

export interface VideoFolder {
  id: number;
  /** null = cartella di primo livello. */
  parentId: number | null;
  name: string;
  color: string | null;
  createdAt: number;
}

export interface SavedVideo {
  id: number;
  youtubeId: string;
  title: string;
  channel: string;
  thumbnailUrl: string | null;
  /** Non la dà oEmbed: si legge dal player al primo avvio e si salva allora. */
  durationSeconds: number | null;
  /** null = "Senza cartella". */
  folderId: number | null;
  position: number;
  watched: boolean;
  /** Ultimo punto raggiunto, per riprendere da dove eri. */
  positionSeconds: number;
  createdAt: number;
  lastWatchedAt: number | null;
}

export interface VideoNote {
  id: number;
  videoId: number;
  timestampSeconds: number;
  text: string;
  createdAt: number;
}

export type NewVideoInput = Pick<SavedVideo, "youtubeId" | "title" | "channel" | "thumbnailUrl" | "folderId">;

/** True se l'errore viene da un vincolo UNIQUE (video già salvato, nome cartella duplicato). */
export function isUniqueViolation(error: unknown): boolean {
  return String(error).includes("UNIQUE constraint failed");
}

// ---------------------------------------------------------------------
// Cartelle
// ---------------------------------------------------------------------

interface FolderRow {
  id: number;
  parent_id: number | null;
  name: string;
  color: string | null;
  created_at: number;
}

/** Tutte le cartelle in una volta: l'albero si costruisce nel frontend (sono poche). */
export async function listFolders(): Promise<VideoFolder[]> {
  const db = await getDatabase();
  const rows = await db.select<FolderRow[]>(
    `SELECT id, parent_id, name, color, created_at FROM video_folders ORDER BY name COLLATE NOCASE`
  );
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    color: r.color,
    createdAt: r.created_at,
  }));
}

/** Lancia un errore UNIQUE (vedi isUniqueViolation) se esiste già una cartella con quel nome nello stesso livello. */
export async function addFolder(name: string, parentId: number | null, color: string | null = null): Promise<void> {
  const db = await getDatabase();
  await db.execute(`INSERT INTO video_folders (parent_id, name, color, created_at) VALUES (?, ?, ?, ?)`, [
    parentId,
    name.trim(),
    color,
    Date.now(),
  ]);
}

export async function renameFolder(id: number, name: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE video_folders SET name = ? WHERE id = ?`, [name.trim(), id]);
}

export async function setFolderColor(id: number, color: string | null): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE video_folders SET color = ? WHERE id = ?`, [color, id]);
}

// Id di una cartella e di tutti i suoi discendenti (parametro: l'id di partenza).
const SUBTREE_IDS = `WITH RECURSIVE sub(id) AS (
    SELECT ?
    UNION ALL
    SELECT f.id FROM video_folders f JOIN sub ON f.parent_id = sub.id
  ) SELECT id FROM sub`;

/**
 * Sposta una cartella sotto un altro genitore (null = primo livello).
 * Rifiuta di spostarla dentro sé stessa o dentro una sua sottocartella.
 */
export async function moveFolder(id: number, newParentId: number | null): Promise<void> {
  const db = await getDatabase();
  if (newParentId !== null) {
    const subtree = await db.select<{ id: number }[]>(SUBTREE_IDS, [id]);
    if (subtree.some((r) => r.id === newParentId)) {
      throw new Error("Non puoi spostare una cartella dentro sé stessa o una sua sottocartella.");
    }
  }
  await db.execute(`UPDATE video_folders SET parent_id = ? WHERE id = ?`, [newParentId, id]);
}

/**
 * Elimina la cartella e tutte le sue sottocartelle. I VIDEO NON si
 * cancellano: tornano in "Senza cartella". Prima i video, poi le cartelle:
 * se l'app si chiude a metà, al peggio resta una cartella vuota.
 */
export async function deleteFolder(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE saved_videos SET folder_id = NULL WHERE folder_id IN (${SUBTREE_IDS})`, [id]);
  await db.execute(`DELETE FROM video_folders WHERE id IN (${SUBTREE_IDS})`, [id]);
}

// ---------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------

interface VideoRow {
  id: number;
  youtube_id: string;
  title: string;
  channel: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  folder_id: number | null;
  position: number;
  watched: number;
  position_seconds: number;
  created_at: number;
  last_watched_at: number | null;
}

const VIDEO_COLUMNS = `id, youtube_id, title, channel, thumbnail_url, duration_seconds, folder_id,
  position, watched, position_seconds, created_at, last_watched_at`;

function mapVideoRow(r: VideoRow): SavedVideo {
  return {
    id: r.id,
    youtubeId: r.youtube_id,
    title: r.title,
    channel: r.channel,
    thumbnailUrl: r.thumbnail_url,
    durationSeconds: r.duration_seconds,
    folderId: r.folder_id,
    position: r.position,
    watched: r.watched === 1,
    positionSeconds: r.position_seconds,
    createdAt: r.created_at,
    lastWatchedAt: r.last_watched_at,
  };
}

/** Solo i video DIRETTAMENTE in quella cartella (null = "Senza cartella"), non quelli delle sottocartelle. */
export async function listVideosInFolder(folderId: number | null): Promise<SavedVideo[]> {
  const db = await getDatabase();
  const rows = await db.select<VideoRow[]>(
    `SELECT ${VIDEO_COLUMNS} FROM saved_videos WHERE folder_id IS ? ORDER BY position, id`,
    [folderId]
  );
  return rows.map(mapVideoRow);
}

/** Tutti i video salvati (la libreria è piccola: raggruppamenti e ricerca si fanno nel frontend). */
export async function listAllVideos(): Promise<SavedVideo[]> {
  const db = await getDatabase();
  const rows = await db.select<VideoRow[]>(`SELECT ${VIDEO_COLUMNS} FROM saved_videos ORDER BY folder_id, position, id`);
  return rows.map(mapVideoRow);
}

export async function getVideo(id: number): Promise<SavedVideo | null> {
  const db = await getDatabase();
  const rows = await db.select<VideoRow[]>(`SELECT ${VIDEO_COLUMNS} FROM saved_videos WHERE id = ?`, [id]);
  return rows[0] ? mapVideoRow(rows[0]) : null;
}

/** Il video salvato con quell'ID di YouTube, ovunque si trovi; null se non c'è. */
export async function findVideoByYoutubeId(youtubeId: string): Promise<SavedVideo | null> {
  const db = await getDatabase();
  const rows = await db.select<VideoRow[]>(`SELECT ${VIDEO_COLUMNS} FROM saved_videos WHERE youtube_id = ?`, [youtubeId]);
  return rows[0] ? mapVideoRow(rows[0]) : null;
}

/** Lancia un errore UNIQUE se quel video è già salvato. Va in fondo alla cartella. */
export async function addVideo(input: NewVideoInput): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO saved_videos (youtube_id, title, channel, thumbnail_url, folder_id, position, created_at)
     VALUES (?, ?, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM saved_videos WHERE folder_id IS ?), 0), ?)`,
    [input.youtubeId, input.title, input.channel, input.thumbnailUrl, input.folderId, input.folderId, Date.now()]
  );
}

/** Sposta un video in un'altra cartella (null = "Senza cartella"), in fondo. */
export async function moveVideo(id: number, folderId: number | null): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE saved_videos
     SET folder_id = ?, position = COALESCE((SELECT MAX(position) + 1 FROM saved_videos WHERE folder_id IS ?), 0)
     WHERE id = ?`,
    [folderId, folderId, id]
  );
}

export async function saveProgress(id: number, positionSeconds: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE saved_videos SET position_seconds = ?, last_watched_at = ? WHERE id = ?`, [
    Math.max(0, Math.floor(positionSeconds)),
    Date.now(),
    id,
  ]);
}

export async function setDuration(id: number, durationSeconds: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE saved_videos SET duration_seconds = ? WHERE id = ?`, [Math.floor(durationSeconds), id]);
}

export async function setWatched(id: number, watched: boolean): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE saved_videos SET watched = ? WHERE id = ?`, [watched ? 1 : 0, id]);
}

// Cancellazione esplicita (niente ON DELETE CASCADE, come in studyRepository). Le sessioni di visione restano
// apposta (migrazione v6): il tempo già guardato non si perde.
export async function deleteVideo(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM video_notes WHERE video_id = ?`, [id]);
  await db.execute(`DELETE FROM video_feedback WHERE video_id = ?`, [id]);
  await db.execute(`DELETE FROM saved_videos WHERE id = ?`, [id]);
}

// ---------------------------------------------------------------------
// Sessioni di visione (segmenti di WatchTracker, al massimo ~30 s l'uno)
// ---------------------------------------------------------------------

export interface WatchSegment {
  videoId: number;
  startedAt: number;
  endedAt: number;
  seconds: number;
}

export async function addWatchSession(videoId: number, startedAt: number, endedAt: number, seconds: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO video_watch_sessions (video_id, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?)`,
    [videoId, Math.floor(startedAt), Math.floor(endedAt), Math.max(0, Math.round(seconds))]
  );
}

/** I segmenti finiti da `since` (ms) in poi, in ordine di inizio. */
export async function listWatchSessions(since: number): Promise<WatchSegment[]> {
  const db = await getDatabase();
  const rows = await db.select<{ video_id: number; started_at: number; ended_at: number; duration_seconds: number }[]>(
    `SELECT video_id, started_at, ended_at, duration_seconds FROM video_watch_sessions
     WHERE ended_at >= ? ORDER BY started_at, id`,
    [since]
  );
  return rows.map((r) => ({ videoId: r.video_id, startedAt: r.started_at, endedAt: r.ended_at, seconds: r.duration_seconds }));
}

/** Secondi realmente guardati, per video (solo quelli con almeno un segmento). */
export async function watchedSecondsByVideo(): Promise<Map<number, number>> {
  const db = await getDatabase();
  const rows = await db.select<{ video_id: number; total: number }[]>(
    `SELECT video_id, SUM(duration_seconds) AS total FROM video_watch_sessions GROUP BY video_id`
  );
  return new Map(rows.map((r) => [r.video_id, r.total]));
}

// ---------------------------------------------------------------------
// Risposte ai consigli: "Non ora" (per video) e "Scarta" (contato per canale)
// ---------------------------------------------------------------------

export interface VideoFeedback {
  videoId: number;
  snoozeCount: number;
  /** ms; null = mai rinviato. */
  snoozedUntil: number | null;
  /** ms; null = mai proposto. */
  lastSuggestedAt: number | null;
}

export async function listVideoFeedback(): Promise<Map<number, VideoFeedback>> {
  const db = await getDatabase();
  const rows = await db.select<
    { video_id: number; snooze_count: number; snoozed_until: number | null; last_suggested_at: number | null }[]
  >(`SELECT video_id, snooze_count, snoozed_until, last_suggested_at FROM video_feedback`);
  return new Map(
    rows.map((r) => [
      r.video_id,
      { videoId: r.video_id, snoozeCount: r.snooze_count, snoozedUntil: r.snoozed_until, lastSuggestedAt: r.last_suggested_at },
    ])
  );
}

/**
 * Un rinvio in più. `untilFor(n)` dà la scadenza (ms) per il nuovo numero di rinvii: la regola sta in
 * lib/recommender.ts (snoozeUntil). Lettura e scrittura in due passi: i rinvii arrivano da un click alla volta.
 */
export async function snoozeVideo(videoId: number, untilFor: (snoozeCount: number) => number): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<{ snooze_count: number }[]>(`SELECT snooze_count FROM video_feedback WHERE video_id = ?`, [videoId]);
  const count = (rows[0]?.snooze_count ?? 0) + 1;
  await db.execute(
    `INSERT INTO video_feedback (video_id, snooze_count, snoozed_until) VALUES (?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET snooze_count = excluded.snooze_count, snoozed_until = excluded.snoozed_until`,
    [videoId, count, Math.floor(untilFor(count))]
  );
}

export async function setLastSuggested(videoId: number, at: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO video_feedback (video_id, last_suggested_at) VALUES (?, ?)
     ON CONFLICT(video_id) DO UPDATE SET last_suggested_at = excluded.last_suggested_at`,
    [videoId, Math.floor(at)]
  );
}

/** Video scartati per canale (contano anche quelli ormai eliminati). */
export async function listChannelDismissals(): Promise<Map<string, number>> {
  const db = await getDatabase();
  const rows = await db.select<{ channel: string; dismissed_count: number }[]>(
    `SELECT channel, dismissed_count FROM video_channel_feedback`
  );
  return new Map(rows.map((r) => [r.channel, r.dismissed_count]));
}

export async function addChannelDismissal(channel: string, at: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO video_channel_feedback (channel, dismissed_count, updated_at) VALUES (?, 1, ?)
     ON CONFLICT(channel) DO UPDATE SET dismissed_count = dismissed_count + 1, updated_at = excluded.updated_at`,
    [channel, Math.floor(at)]
  );
}

// ---------------------------------------------------------------------
// Note con timestamp
// ---------------------------------------------------------------------

export async function listNotes(videoId: number): Promise<VideoNote[]> {
  const db = await getDatabase();
  const rows = await db.select<
    { id: number; video_id: number; timestamp_seconds: number; text: string; created_at: number }[]
  >(
    `SELECT id, video_id, timestamp_seconds, text, created_at
     FROM video_notes WHERE video_id = ? ORDER BY timestamp_seconds, id`,
    [videoId]
  );
  return rows.map((r) => ({
    id: r.id,
    videoId: r.video_id,
    timestampSeconds: r.timestamp_seconds,
    text: r.text,
    createdAt: r.created_at,
  }));
}

/** Quante note ha ogni video (solo quelli che ne hanno). */
export async function noteCountsByVideo(): Promise<Map<number, number>> {
  const db = await getDatabase();
  const rows = await db.select<{ video_id: number; n: number }[]>(
    `SELECT video_id, COUNT(*) AS n FROM video_notes GROUP BY video_id`
  );
  return new Map(rows.map((r) => [r.video_id, r.n]));
}

export async function addNote(videoId: number, timestampSeconds: number, text: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`INSERT INTO video_notes (video_id, timestamp_seconds, text, created_at) VALUES (?, ?, ?, ?)`, [
    videoId,
    Math.max(0, Math.floor(timestampSeconds)),
    text.trim(),
    Date.now(),
  ]);
}

export async function updateNote(id: number, text: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE video_notes SET text = ? WHERE id = ?`, [text.trim(), id]);
}

export async function deleteNote(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM video_notes WHERE id = ?`, [id]);
}
