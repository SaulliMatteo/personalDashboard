import type { SavedVideo, VideoFeedback, VideoFolder, WatchSegment } from "../data/youtubeRepository";

/**
 * Consigli del widget YouTube: quale video proporre ADESSO. Logica pura (niente DB, niente React), orologio e
 * random iniettati: si prova con scripts/youtube/recommender.test.mts.
 *
 * Ogni segnale vale 0..1 (bonus) o -1..1 / -1..0 (penalità); il punteggio è la somma pesata (WEIGHTS). Niente
 * machine learning: solo regole leggibili sui dati che l'app ha già. L'assenza di dati vale sempre 0 (neutro).
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// ---------------------------------------------------------------------
// Pesi
// ---------------------------------------------------------------------

export type SignalName =
  | "riscoperta"
  | "interesse"
  | "inCorso"
  | "abbandono"
  | "serie"
  | "varieta"
  | "preferenze"
  | "rinvii"
  | "tempo";

/**
 * Pesi dei segnali. Sono IPOTESI INIZIALI, non valori misurati: vanno regolati guardando cosa propone il widget.
 * Con questi valori un video iniziato da poco (inCorso) batte un video dimenticato da mesi (riscoperta), che
 * a sua volta batte un video salvato ieri; un video lasciato a metà da settimane (abbandono) scende sotto zero.
 */
export const WEIGHTS: Record<SignalName, number> = {
  /** Da quanto non lo vedi (o da quanto è salvato): il motivo per cui il widget esiste. */
  riscoperta: 1.0,
  /** Note prese e tempo davvero guardato: ti interessava sul serio. */
  interesse: 1.0,
  /** Visto negli ultimi giorni con un avanzamento vero: probabilmente lo vuoi finire. */
  inCorso: 1.4,
  /** Aperto da settimane e mollato quasi subito. */
  abbandono: 1.0,
  /** Il precedente della cartella è finito (bonus) / manca una parte precedente (penalità). */
  serie: 0.8,
  /** Stesso canale o cartella dell'ultimo video guardato: si alterna un po'. */
  varieta: 0.5,
  /** Quanto finisci i video di quel canale e di quella cartella (prudente con pochi casi). */
  preferenze: 0.6,
  /** Già rinviato più volte. */
  rinvii: 0.8,
  /** Il tempo che resta è in linea con quello che guardi di solito in questa fascia. */
  tempo: 0.5,
};

// Soglie delle regole (anche queste ipotesi).
/** Riscoperta: oltre questi giorni il segnale è pieno. */
const REDISCOVERY_SATURATION_DAYS = 180;
/** Interesse: note e secondi guardati per avere il massimo. */
const INTEREST_FULL_NOTES = 3;
const INTEREST_FULL_SECONDS = 5 * 60;
/** In corso: visto da non più di 3 giorni con almeno il 5%. */
const IN_PROGRESS_DAYS = 3;
const MIN_PROGRESS = 0.05;
/** Abbandono: aperto da più di 14 giorni e fermo sotto il 5%. */
const ABANDON_DAYS = 14;
/** Preferenze: sotto 5 casi neutro; fiducia piena da 15. */
const PREF_MIN_CASES = 5;
const PREF_FULL_CASES = 15;
/** Rinvii: penalità piena da 4 rinvii. */
const SNOOZE_FULL = 4;
/** Fascia oraria: servono almeno 10 sessioni; pause più corte di 5 minuti non spezzano una sessione. */
const BAND_MIN_SESSIONS = 10;
export const SESSION_GAP_MS = 5 * MINUTE_MS;
/** Scelta: al massimo 3 candidati entro il 15% del migliore. */
const PICK_POOL = 3;
const PICK_TOLERANCE = 0.15;
/** Dal terzo rinvio il motivo propone di scartarlo. */
const SUGGEST_DISCARD_AFTER = 3;

// ---------------------------------------------------------------------
// Rinvii
// ---------------------------------------------------------------------

/** Giorni di rinvio dopo l'n-esimo "Non ora": 3, 6, 12, 24, 48, poi sempre 60. */
export function snoozeDays(snoozeCount: number): number {
  const n = Math.max(1, Math.floor(snoozeCount));
  return Math.min(60, 3 * 2 ** (n - 1));
}

/** Fino a quando (ms) resta nascosto un video rinviato per l'n-esima volta. */
export function snoozeUntil(snoozeCount: number, now: number): number {
  return now + snoozeDays(snoozeCount) * DAY_MS;
}

// ---------------------------------------------------------------------
// Fasce orarie e sessioni
// ---------------------------------------------------------------------

export type DayBand = "mattina" | "pomeriggio" | "sera" | "notte";

/** Mattina 6-12, pomeriggio 12-18, sera 18-23, notte 23-6, in ora locale. */
export function bandOf(ms: number): DayBand {
  const h = new Date(ms).getHours();
  if (h >= 6 && h < 12) return "mattina";
  if (h >= 12 && h < 18) return "pomeriggio";
  if (h >= 18 && h < 23) return "sera";
  return "notte";
}

export interface WatchSitting {
  videoId: number;
  startedAt: number;
  seconds: number;
}

/**
 * Da segmenti (≤30 s, vedi WatchTracker) a sessioni: segmenti dello STESSO video separati da meno di
 * SESSION_GAP_MS sono una sessione sola. La fascia di una sessione è quella del suo inizio.
 */
export function groupSittings(segments: readonly WatchSegment[], gapMs = SESSION_GAP_MS): WatchSitting[] {
  const sorted = [...segments].sort((a, b) => a.startedAt - b.startedAt);
  const open = new Map<number, { sitting: WatchSitting; endedAt: number }>();
  const out: WatchSitting[] = [];
  for (const s of sorted) {
    const current = open.get(s.videoId);
    if (current && s.startedAt - current.endedAt <= gapMs) {
      current.sitting.seconds += s.seconds;
      current.endedAt = Math.max(current.endedAt, s.endedAt);
    } else {
      const sitting = { videoId: s.videoId, startedAt: s.startedAt, seconds: s.seconds };
      out.push(sitting);
      open.set(s.videoId, { sitting, endedAt: s.endedAt });
    }
  }
  return out;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------
// Classifica
// ---------------------------------------------------------------------

export interface RecommenderInput {
  videos: readonly SavedVideo[];
  folders: readonly VideoFolder[];
  /** Note per video (assente = 0). */
  noteCounts: ReadonlyMap<number, number>;
  /** Secondi realmente guardati per video (assente = nessun dato). */
  watchedSeconds: ReadonlyMap<number, number>;
  /** Segmenti di visione recenti, per le fasce orarie. */
  segments: readonly WatchSegment[];
  feedback: ReadonlyMap<number, VideoFeedback>;
  /** Video scartati per canale. */
  channelDismissals: ReadonlyMap<string, number>;
  /** Video in attesa di scarto (durante "Annulla"): esclusi. */
  pendingDiscardIds: ReadonlySet<number>;
  now: number;
}

/** I dati reali dietro a un segnale, per scrivere il motivo senza inventare. */
export type SignalFacts =
  | { kind: "riscoperta"; days: number; since: "salvato" | "aperto"; notes: number }
  | { kind: "interesse"; notes: number; watchedSeconds: number }
  | { kind: "inCorso"; days: number; progress: number }
  | { kind: "serie"; previousTitle: string; folderName: string }
  | { kind: "preferenze"; scope: "canale" | "cartella"; name: string; finished: number; total: number }
  | { kind: "tempo"; remainingSeconds: number; band: DayBand };

export interface Signal {
  value: number;
  contribution: number;
  facts?: SignalFacts;
}

export interface RankedVideo {
  video: SavedVideo;
  score: number;
  signals: Record<SignalName, Signal>;
  snoozeCount: number;
}

export interface Ranking {
  /** Ordinata: per punteggio, oppure (fallback "snoozed") per scadenza del rinvio. */
  items: RankedVideo[];
  /** "snoozed" = erano tutti rinviati: si ignorano i rinvii pur di proporre qualcosa. */
  fallback: "snoozed" | null;
  band: DayBand;
}

/** Avanzamento 0..1, oppure null se la durata non si conosce. */
function knownProgress(v: SavedVideo): number | null {
  if (!v.durationSeconds || v.durationSeconds <= 0) return null;
  return Math.min(1, Math.max(0, v.positionSeconds / v.durationSeconds));
}

/** Aperto da più di 14 giorni e fermo sotto il 5% (serve la durata). */
function isAbandoned(v: SavedVideo, now: number): boolean {
  if (v.watched || v.lastWatchedAt === null) return false;
  const progress = knownProgress(v);
  return progress !== null && progress < MIN_PROGRESS && now - v.lastWatchedAt > ABANDON_DAYS * DAY_MS;
}

const EPISODE = /\b(?:parte|part|ep|episodio|episode|lezione|lesson|lez)\.?\s*#?\s*(\d+)/i;

/** Il numero di parte/episodio/lezione nel titolo, se c'è. */
export function episodeNumber(title: string): number | null {
  const m = EPISODE.exec(title);
  return m ? Number(m[1]) : null;
}

const byPosition = (a: SavedVideo, b: SavedVideo) => a.position - b.position || a.id - b.id;

interface Outcomes {
  finished: number;
  abandoned: number;
}

function preferenceValue(o: Outcomes): number | null {
  const n = o.finished + o.abandoned;
  if (n < PREF_MIN_CASES) return null;
  return ((o.finished - o.abandoned) / n) * Math.min(1, n / PREF_FULL_CASES);
}

/** Classifica dei video da proporre, con il contributo di ogni segnale. */
export function rankVideos(input: RecommenderInput): Ranking {
  const { videos, folders, now } = input;
  const band = bandOf(now);
  const folderName = new Map(folders.map((f) => [f.id, f.name]));

  // Esiti per canale e cartella (finiti / abbandonati), più gli scarti del canale.
  const channelOutcomes = new Map<string, Outcomes>();
  const folderOutcomes = new Map<number, Outcomes>();
  const outcomeOf = (v: SavedVideo) => (v.watched ? "finished" : isAbandoned(v, now) ? "abandoned" : null);
  const bump = <K>(map: Map<K, Outcomes>, key: K, kind: keyof Outcomes) => {
    const o = map.get(key) ?? { finished: 0, abandoned: 0 };
    o[kind] += 1;
    map.set(key, o);
  };
  for (const v of videos) {
    const kind = outcomeOf(v);
    if (!kind) continue;
    if (v.channel) bump(channelOutcomes, v.channel, kind);
    if (v.folderId !== null) bump(folderOutcomes, v.folderId, kind);
  }

  // Ultimo video guardato: quello aperto più di recente.
  let last: SavedVideo | null = null;
  for (const v of videos) {
    if (v.lastWatchedAt !== null && (!last || v.lastWatchedAt > (last.lastWatchedAt ?? 0))) last = v;
  }

  // Sessioni della fascia corrente.
  const bandSeconds = groupSittings(input.segments)
    .filter((s) => bandOf(s.startedAt) === band)
    .map((s) => s.seconds);
  const bandMedian = bandSeconds.length >= BAND_MIN_SESSIONS ? median(bandSeconds) : null;

  const siblingsOf = new Map<number, SavedVideo[]>();
  for (const v of videos) {
    if (v.folderId === null) continue;
    const list = siblingsOf.get(v.folderId) ?? [];
    list.push(v);
    siblingsOf.set(v.folderId, list);
  }
  for (const list of siblingsOf.values()) list.sort(byPosition);

  function score(v: SavedVideo): RankedVideo {
    const notes = input.noteCounts.get(v.id) ?? 0;
    const watchedSeconds = input.watchedSeconds.get(v.id) ?? 0;
    const progress = knownProgress(v);
    const snoozeCount = input.feedback.get(v.id)?.snoozeCount ?? 0;
    const raw: Record<SignalName, { value: number; facts?: SignalFacts }> = {
      riscoperta: { value: 0 },
      interesse: { value: 0 },
      inCorso: { value: 0 },
      abbandono: { value: 0 },
      serie: { value: 0 },
      varieta: { value: 0 },
      preferenze: { value: 0 },
      rinvii: { value: 0 },
      tempo: { value: 0 },
    };

    // Riscoperta: curva logaritmica, piena intorno ai 180 giorni.
    const since = v.lastWatchedAt ?? v.createdAt;
    const days = Math.max(0, (now - since) / DAY_MS);
    raw.riscoperta = {
      value: Math.min(1, Math.log1p(days) / Math.log1p(REDISCOVERY_SATURATION_DAYS)),
      facts: { kind: "riscoperta", days, since: v.lastWatchedAt === null ? "salvato" : "aperto", notes },
    };

    // Interesse: note e tempo guardato davvero.
    raw.interesse = {
      value: 0.6 * Math.min(1, notes / INTEREST_FULL_NOTES) + 0.4 * Math.min(1, watchedSeconds / INTEREST_FULL_SECONDS),
      facts: { kind: "interesse", notes, watchedSeconds },
    };

    // In corso / abbandono: servono la durata e un'apertura.
    if (v.lastWatchedAt !== null && progress !== null) {
      const openedDays = (now - v.lastWatchedAt) / DAY_MS;
      if (openedDays <= IN_PROGRESS_DAYS && progress >= MIN_PROGRESS) {
        raw.inCorso = { value: 1, facts: { kind: "inCorso", days: openedDays, progress } };
      }
    }
    if (isAbandoned(v, now)) raw.abbandono = { value: -1 };

    // Serie: il precedente nella cartella; penalità solo con numerazione riconoscibile.
    if (v.folderId !== null) {
      const siblings = siblingsOf.get(v.folderId) ?? [];
      const index = siblings.findIndex((s) => s.id === v.id);
      const previous = index > 0 ? siblings[index - 1] : null;
      const n = episodeNumber(v.title);
      const missingEarlier =
        n !== null &&
        siblings.some((s) => {
          if (s.id === v.id || s.watched) return false;
          const m = episodeNumber(s.title);
          return m !== null && m < n;
        });
      if (missingEarlier) raw.serie = { value: -1 };
      else if (previous?.watched) {
        raw.serie = {
          value: 1,
          facts: { kind: "serie", previousTitle: previous.title, folderName: folderName.get(v.folderId) ?? "" },
        };
      }
    }

    // Varietà: rispetto all'ultimo video guardato (non a sé stesso).
    if (last && last.id !== v.id) {
      let value = 0;
      if (v.channel && v.channel === last.channel) value -= 0.5;
      if (v.folderId !== null && v.folderId === last.folderId) value -= 0.5;
      raw.varieta = { value };
    }

    // Preferenze: esiti di canale e cartella senza contare il video stesso; gli scarti contano come abbandoni.
    const own = outcomeOf(v);
    const minus = (o: Outcomes | undefined): Outcomes => ({
      finished: (o?.finished ?? 0) - (own === "finished" ? 1 : 0),
      abandoned: (o?.abandoned ?? 0) - (own === "abandoned" ? 1 : 0),
    });
    const prefParts: { value: number; facts: SignalFacts }[] = [];
    if (v.channel) {
      const o = minus(channelOutcomes.get(v.channel));
      o.abandoned += input.channelDismissals.get(v.channel) ?? 0;
      const value = preferenceValue(o);
      if (value !== null) {
        const total = o.finished + o.abandoned;
        prefParts.push({ value, facts: { kind: "preferenze", scope: "canale", name: v.channel, finished: o.finished, total } });
      }
    }
    if (v.folderId !== null) {
      const o = minus(folderOutcomes.get(v.folderId));
      const value = preferenceValue(o);
      if (value !== null) {
        const total = o.finished + o.abandoned;
        const name = folderName.get(v.folderId) ?? "";
        prefParts.push({ value, facts: { kind: "preferenze", scope: "cartella", name, finished: o.finished, total } });
      }
    }
    if (prefParts.length > 0) {
      const value = prefParts.reduce((sum, p) => sum + p.value, 0) / prefParts.length;
      const strongest = prefParts.reduce((a, b) => (b.value > a.value ? b : a));
      raw.preferenze = { value, facts: strongest.facts };
    }

    // Rinvii.
    raw.rinvii = { value: -Math.min(1, snoozeCount / SNOOZE_FULL) };

    // Tempo residuo rispetto alle sessioni di questa fascia.
    if (bandMedian !== null && bandMedian > 0 && v.durationSeconds && v.durationSeconds > 0) {
      const remaining = Math.max(0, v.durationSeconds - v.positionSeconds);
      const r = remaining / bandMedian;
      raw.tempo = {
        value: r <= 1 ? 1 : Math.max(-1, 1 - (r - 1)),
        facts: { kind: "tempo", remainingSeconds: remaining, band },
      };
    }

    const signals = {} as Record<SignalName, Signal>;
    let total = 0;
    for (const name of Object.keys(WEIGHTS) as SignalName[]) {
      const contribution = raw[name].value * WEIGHTS[name];
      signals[name] = { value: raw[name].value, contribution, facts: raw[name].facts };
      total += contribution;
    }
    return { video: v, score: total, signals, snoozeCount };
  }

  const candidates = videos.filter((v) => !v.watched && !input.pendingDiscardIds.has(v.id));
  const snoozedUntil = (v: SavedVideo) => input.feedback.get(v.id)?.snoozedUntil ?? null;
  const isSnoozed = (v: SavedVideo) => {
    const until = snoozedUntil(v);
    return until !== null && until > now;
  };
  const active = candidates.filter((v) => !isSnoozed(v));

  if (active.length > 0) {
    const items = active.map(score).sort((a, b) => b.score - a.score || a.video.id - b.video.id);
    return { items, fallback: null, band };
  }
  // Solo video rinviati: meglio proporre quello che torna per primo che dire "nessun video".
  const items = candidates
    .map(score)
    .sort((a, b) => (snoozedUntil(a.video) ?? 0) - (snoozedUntil(b.video) ?? 0) || a.video.id - b.video.id);
  return { items, fallback: items.length > 0 ? "snoozed" : null, band };
}

// ---------------------------------------------------------------------
// Scelta (con stabilità)
// ---------------------------------------------------------------------

/** Estrazione pesata tra i (max 3) migliori entro il 15% del primo. Null se la classifica è vuota. */
export function pickFromRanking(ranking: Ranking, random: () => number): RankedVideo | null {
  const { items } = ranking;
  if (items.length === 0) return null;
  // Tutti rinviati: quello che scade prima, senza sorteggio.
  if (ranking.fallback === "snoozed") return items[0];
  const best = items[0].score;
  const tolerance = PICK_TOLERANCE * Math.max(Math.abs(best), 0.01);
  const floor = best - tolerance;
  const pool = items.slice(0, PICK_POOL).filter((i) => i.score >= floor);
  // Peso = distanza dal limite più una base, così anche l'ultimo del gruppo ha qualche possibilità.
  const weights = pool.map((i) => i.score - floor + tolerance * 0.25);
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.min(Math.max(random(), 0), 0.999999) * sum;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** La scelta salvata (in core/db/meta.ts): il video proposto, la fascia e quando. */
export interface SavedChoice {
  videoId: number;
  band: DayBand;
  chosenAt: number;
}

const BANDS: readonly DayBand[] = ["mattina", "pomeriggio", "sera", "notte"];

export function parseSavedChoice(text: string | null): SavedChoice | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text) as Partial<SavedChoice>;
    if (typeof data.videoId !== "number" || typeof data.chosenAt !== "number") return null;
    if (!BANDS.includes(data.band as DayBand)) return null;
    return { videoId: data.videoId, band: data.band as DayBand, chosenAt: data.chosenAt };
  } catch {
    return null;
  }
}

export interface Choice {
  pick: RankedVideo | null;
  /** La scelta da salvare (null = niente da proporre). */
  choice: SavedChoice | null;
  /** True se è diversa da quella salvata: va salvata e va aggiornato last_suggested_at. */
  changed: boolean;
}

/**
 * Tiene la scelta salvata finché il video è ancora tra i candidati (non guardato, non rinviato, non in attesa
 * di scarto, non eliminato) e la fascia è la stessa; se la fascia è cambiata la tiene solo se quel video è stato
 * iniziato dopo la scelta, nella fascia in cui era stato scelto. Altrimenti estrae di nuovo.
 */
export function chooseSuggestion(saved: SavedChoice | null, ranking: Ranking, now: number, random: () => number): Choice {
  if (saved && ranking.fallback === null) {
    const kept = ranking.items.find((i) => i.video.id === saved.videoId);
    if (kept) {
      const sameBand = saved.band === ranking.band;
      const at = kept.video.lastWatchedAt;
      const startedInBand = at !== null && at >= saved.chosenAt && bandOf(at) === saved.band;
      if (sameBand || startedInBand) return { pick: kept, choice: saved, changed: false };
    }
  }
  const pick = pickFromRanking(ranking, random);
  if (!pick) return { pick: null, choice: null, changed: saved !== null };
  if (saved && saved.videoId === pick.video.id && saved.band === ranking.band) {
    return { pick, choice: saved, changed: false };
  }
  return { pick, choice: { videoId: pick.video.id, band: ranking.band, chosenAt: now }, changed: true };
}

// ---------------------------------------------------------------------
// Motivo
// ---------------------------------------------------------------------

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "oggi", "ieri", "5 giorni fa", "3 settimane fa", "5 mesi fa", "un anno fa". */
export function agoText(days: number): string {
  const d = Math.floor(days);
  if (d < 1) return "oggi";
  if (d === 1) return "ieri";
  if (d < 14) return `${d} giorni fa`;
  if (d < 60) return `${Math.floor(d / 7)} settimane fa`;
  if (d < 365) return `${Math.floor(d / 30)} mesi fa`;
  const years = Math.floor(d / 365);
  return years === 1 ? "un anno fa" : `${years} anni fa`;
}

function minutesText(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return m === 1 ? "1 minuto" : `${m} minuti`;
}

const BAND_PHRASE: Record<DayBand, string> = {
  mattina: "la mattina",
  pomeriggio: "il pomeriggio",
  sera: "la sera",
  notte: "di notte",
};

function phraseFor(facts: SignalFacts): string | null {
  switch (facts.kind) {
    case "riscoperta": {
      const head = `${facts.since === "salvato" ? "Salvato" : "Aperto l'ultima volta"} ${agoText(facts.days)}`;
      return facts.notes > 0 ? `${head}, con ${plural(facts.notes, "nota", "note")}` : head;
    }
    case "interesse":
      if (facts.notes > 0) {
        const tail = facts.watchedSeconds >= 60 ? ` e ne hai guardati ${minutesText(facts.watchedSeconds)}` : "";
        return `Ci hai preso ${plural(facts.notes, "nota", "note")}${tail}`;
      }
      return facts.watchedSeconds >= 60 ? `Ne hai già guardati ${minutesText(facts.watchedSeconds)}` : null;
    case "inCorso":
      return `Iniziato ${agoText(facts.days)}, sei al ${Math.round(facts.progress * 100)}%`;
    case "serie":
      return facts.folderName ? `Il precedente in «${facts.folderName}» l'hai finito` : "Il precedente l'hai finito";
    case "preferenze": {
      const where = facts.scope === "canale" ? `Di «${facts.name}»` : `In «${facts.name}»`;
      return `${where} ne hai finiti ${facts.finished} su ${facts.total}`;
    }
    case "tempo":
      return `Restano ${minutesText(facts.remainingSeconds)}, come quelli che guardi ${BAND_PHRASE[facts.band]}`;
  }
}

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

/**
 * Una frase breve dal segnale che pesa di più, fatta solo di dati veri. Dal terzo rinvio propone di
 * scartarlo; se erano tutti rinviati lo dice; senza segnali positivi, la data di salvataggio.
 */
export function describeReason(item: RankedVideo, ranking: Pick<Ranking, "fallback">): string {
  if (item.snoozeCount >= SUGGEST_DISCARD_AFTER) {
    return `Rinviato ${item.snoozeCount} volte: se non ti interessa più, scartalo`;
  }
  if (ranking.fallback === "snoozed") return "Gli altri video sono tutti rinviati";
  const ordered = (Object.keys(item.signals) as SignalName[])
    .map((name) => item.signals[name])
    .filter((s) => s.contribution > 0 && s.facts)
    .sort((a, b) => b.contribution - a.contribution);
  for (const signal of ordered) {
    const text = signal.facts ? phraseFor(signal.facts) : null;
    if (text) return text;
  }
  return `Salvato il ${DATE_FORMAT.format(new Date(item.video.createdAt))}`;
}
