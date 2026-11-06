import { addChannelDismissal, deleteVideo, type SavedVideo } from "../data/youtubeRepository";

/**
 * "Scarta" con un attimo per ripensarci: il video sparisce subito dai consigli, ma si elimina davvero solo
 * dopo UNDO_MS senza "Annulla". Allo scadere il canale conta uno scarto in più (se lo conosciamo) e il video
 * si cancella con le sue note. Niente archivio né stato "scartato": o torna com'era o non c'è più.
 *
 * È stato di modulo (come lib/launch.ts) e non stato React: il timer deve sopravvivere allo smontaggio
 * del widget (si va nella pagina di dettaglio, si cambia schermata). Se l'app si chiude prima della
 * scadenza il video resta salvato: è voluto.
 */
export const UNDO_MS = 8000;

interface Pending {
  video: SavedVideo;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<number, Pending>();
const listeners = new Set<() => void>();
// Fotografia immutabile per useSyncExternalStore: cambia identità solo quando cambia il contenuto.
let snapshot: readonly SavedVideo[] = [];

function changed(): void {
  snapshot = [...pending.values()].map((p) => p.video);
  for (const listener of listeners) listener();
}

/** Mette il video in attesa di eliminazione. Una seconda richiesta sullo stesso video non fa nulla. */
export function requestDiscard(video: SavedVideo, onError: (e: unknown) => void = console.error): void {
  if (pending.has(video.id)) return;
  const timer = setTimeout(() => void commit(video, onError), UNDO_MS);
  pending.set(video.id, { video, timer });
  changed();
}

/** "Annulla": il video torna com'era. */
export function undoDiscard(videoId: number): void {
  const entry = pending.get(videoId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(videoId);
  changed();
}

async function commit(video: SavedVideo, onError: (e: unknown) => void): Promise<void> {
  try {
    const channel = video.channel.trim();
    if (channel) await addChannelDismissal(channel, Date.now());
    await deleteVideo(video.id);
  } catch (e) {
    // Il video resta (o resta in parte): ricompare tra i consigli invece di sparire senza essere stato eliminato.
    onError(e);
  } finally {
    pending.delete(video.id);
    changed();
  }
}

/** I video in attesa di eliminazione, nell'ordine in cui sono stati scartati. */
export function pendingDiscards(): readonly SavedVideo[] {
  return snapshot;
}

export function subscribeDiscards(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
