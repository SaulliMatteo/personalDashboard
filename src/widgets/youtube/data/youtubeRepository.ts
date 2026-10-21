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

/**
 * Il video che il widget propone: l'ultimo iniziato e non finito (posizione salvata
 * e non segnato come guardato); se non ce n'è, il primo salvato che non hai ancora
 * guardato (il più vecchio). Null se non c'è nulla da guardare.
 */
export async function getVideoToContinue(): Promise<SavedVideo | null> {
  const db = await getDatabase();
  const started = await db.select<VideoRow[]>(
    `SELECT ${VIDEO_COLUMNS} FROM saved_videos
     WHERE watched = 0 AND position_seconds > 0
     ORDER BY last_watched_at DESC, id DESC LIMIT 1`
  );
  if (started[0]) return mapVideoRow(started[0]);
  const next = await db.select<VideoRow[]>(
    `SELECT ${VIDEO_COLUMNS} FROM saved_videos WHERE watched = 0 ORDER BY created_at ASC, id ASC LIMIT 1`
  );
  return next[0] ? mapVideoRow(next[0]) : null;
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

// Cancellazione esplicita (niente ON DELETE CASCADE, come in studyRepository).
export async function deleteVideo(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM video_notes WHERE video_id = ?`, [id]);
  await db.execute(`DELETE FROM saved_videos WHERE id = ?`, [id]);
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
