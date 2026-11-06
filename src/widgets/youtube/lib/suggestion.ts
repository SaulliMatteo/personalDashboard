import { getMeta, setMeta } from "../../../core/db/meta";
import {
  listAllVideos,
  listChannelDismissals,
  listFolders,
  listVideoFeedback,
  listWatchSessions,
  noteCountsByVideo,
  setLastSuggested,
  snoozeVideo,
  watchedSecondsByVideo,
  type SavedVideo,
} from "../data/youtubeRepository";
import { pendingDiscards, subscribeDiscards } from "./discard";
import { chooseSuggestion, describeReason, parseSavedChoice, rankVideos, snoozeUntil } from "./recommender";

/**
 * Il video consigliato, UNO per tutta l'app: widget, mini e Home chiamano getSuggestion() e ricevono lo stesso
 * risultato (le chiamate contemporanee condividono la stessa lettura). Non è puro: legge il DB e salva la scelta
 * in meta, così resta la stessa tra un montaggio e l'altro (e tra un avvio e l'altro). Le regole sono in
 * lib/recommender.ts.
 */

const CHOICE_KEY = "youtube.suggestion";
/** Le fasce orarie guardano le sessioni dell'ultimo anno. */
const SESSIONS_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

export interface Suggestion {
  /** Il video proposto; null = niente da guardare. */
  pick: SavedVideo | null;
  /** Perché proprio questo (frase breve, dati reali). */
  reason: string | null;
  /** Note del video proposto: "Scarta" chiede conferma se ce ne sono. */
  pickNotes: number;
  /** Gli altri, nell'ordine della classifica ("Prossimi", "Da guardare"). */
  queue: SavedVideo[];
  /** Video non guardati (rinviati compresi, in attesa di scarto esclusi): "N in coda". */
  pendingCount: number;
}

export const EMPTY_SUGGESTION: Suggestion = { pick: null, reason: null, pickNotes: 0, queue: [], pendingCount: 0 };

let inflight: Promise<Suggestion> | null = null;
// Le letture partono una dopo l'altra: una partita dopo un'invalidazione vede la scelta salvata dalla precedente.
let computeChain: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

export function getSuggestion(): Promise<Suggestion> {
  if (!inflight) {
    const current = computeChain.then(compute, compute);
    computeChain = current.catch(() => undefined);
    inflight = current;
    // Finita la lettura, la prossima chiamata ne fa una nuova (i dati possono essere cambiati).
    void current.then(
      () => {
        if (inflight === current) inflight = null;
      },
      () => {
        if (inflight === current) inflight = null;
      }
    );
  }
  return inflight;
}

/** Qualcosa è cambiato (rinvio, scarto, annulla): chi mostra il consiglio lo rilegge. */
export function invalidateSuggestion(): void {
  inflight = null;
  for (const listener of listeners) listener();
}

export function subscribeSuggestion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Uno scarto (o un annulla, o l'eliminazione allo scadere) cambia il consiglio.
subscribeDiscards(invalidateSuggestion);

/** "Non ora": nasconde il video per un po' (vedi snoozeDays) e passa al successivo. */
export async function snoozeSuggested(videoId: number): Promise<void> {
  await snoozeVideo(videoId, (count) => snoozeUntil(count, Date.now()));
  invalidateSuggestion();
}

async function compute(): Promise<Suggestion> {
  const now = Date.now();
  const [videos, folders, noteCounts, watchedSeconds, segments, feedback, channelDismissals, savedText] = await Promise.all([
    listAllVideos(),
    listFolders(),
    noteCountsByVideo(),
    watchedSecondsByVideo(),
    listWatchSessions(now - SESSIONS_WINDOW_MS),
    listVideoFeedback(),
    listChannelDismissals(),
    getMeta(CHOICE_KEY),
  ]);
  const pendingDiscardIds = new Set(pendingDiscards().map((v) => v.id));
  const ranking = rankVideos({
    videos,
    folders,
    noteCounts,
    watchedSeconds,
    segments,
    feedback,
    channelDismissals,
    pendingDiscardIds,
    now,
  });
  const saved = parseSavedChoice(savedText);
  const { pick, choice, changed } = chooseSuggestion(saved, ranking, now, Math.random);

  // Se il video salvato è solo in attesa di scarto la scelta non si tocca: con "Annulla" torna lui.
  const savedIsPendingDiscard = saved !== null && pendingDiscardIds.has(saved.videoId);
  if (changed && choice && !savedIsPendingDiscard) {
    await setMeta(CHOICE_KEY, JSON.stringify(choice));
    await setLastSuggested(choice.videoId, now);
  }

  return {
    pick: pick?.video ?? null,
    reason: pick ? describeReason(pick, ranking) : null,
    pickNotes: pick ? (noteCounts.get(pick.video.id) ?? 0) : 0,
    queue: ranking.items.filter((i) => i !== pick).map((i) => i.video),
    pendingCount: videos.filter((v) => !v.watched && !pendingDiscardIds.has(v.id)).length,
  };
}
