import { normalizeText } from "./library";

/** Il minimo che serve al collegamento di una materia dello Studio. */
export interface LinkableSubject {
  id: number;
  name: string;
}

/**
 * La materia che ha lo stesso nome della cartella DIRETTA del video, senza
 * badare a maiuscole, accenti e spazi doppi. Le sottocartelle non contano e
 * nemmeno i nomi parziali. Null se nessuna combacia.
 */
export function matchSubject(subjects: LinkableSubject[], folderName: string | null): LinkableSubject | null {
  if (folderName === null) return null;
  const wanted = canonical(folderName);
  if (!wanted) return null;
  return subjects.find((s) => canonical(s.name) === wanted) ?? null;
}

function canonical(name: string): string {
  return normalizeText(name).replace(/\s+/g, " ").trim();
}

export interface StudyLinkConfig {
  enabled: boolean;
  /** Nome della cartella diretta del video; null = "Senza cartella". */
  folderName: string | null;
  /** Durata minima di una sessione di studio (impostazione dello Studio). */
  minSeconds: number;
}

export interface StudyLinkDeps {
  /** Le materie ATTIVE dello Studio. */
  listSubjects: () => Promise<LinkableSubject[]>;
  /** True se il timer dello Studio sta contando in una fase di lavoro. */
  isStudyTimerRunning: () => Promise<boolean>;
  logSession: (subjectId: number, endedAt: number, durationSeconds: number) => Promise<void>;
  /** Letto a ogni segmento: l'utente può cambiare impostazione mentre guarda. */
  getConfig: () => StudyLinkConfig;
}

/**
 * Trasforma i segmenti di visione (vedi WatchTracker) in sessioni di studio.
 * Un segmento non viene registrato se: il collegamento è spento, il timer dello
 * Studio sta lavorando (si conterebbe due volte), nessuna materia attiva ha il
 * nome della cartella. I segmenti troppo corti si sommano finché raggiungono
 * il minimo; quello che resta sotto il minimo alla chiusura si scarta.
 */
export class StudyLinkRecorder {
  private pendingSeconds = 0;
  private pendingEnd = 0;
  private chain: Promise<void> = Promise.resolve();

  private readonly deps: StudyLinkDeps;

  constructor(deps: StudyLinkDeps) {
    this.deps = deps;
  }

  /** Da chiamare per ogni segmento di visione. Non lancia mai: gli errori vanno a `onError`. */
  add(endedAt: number, seconds: number, onError: (e: unknown) => void = console.error): void {
    const config = this.deps.getConfig();
    if (!config.enabled || seconds <= 0) return;
    this.pendingSeconds += seconds;
    this.pendingEnd = Math.max(this.pendingEnd, endedAt);
    if (this.pendingSeconds < Math.max(1, config.minSeconds)) return;

    // Il blocco si stacca subito (sincrono): i flush successivi non lo contano due volte.
    const total = Math.round(this.pendingSeconds);
    const end = this.pendingEnd;
    this.pendingSeconds = 0;
    this.pendingEnd = 0;
    this.chain = this.chain.then(() => this.flush(total, end, config.folderName)).catch(onError);
  }

  /** Per i test: attende i salvataggi in corso. */
  idle(): Promise<void> {
    return this.chain;
  }

  private async flush(seconds: number, endedAt: number, folderName: string | null): Promise<void> {
    if (await this.deps.isStudyTimerRunning()) return;
    const subject = matchSubject(await this.deps.listSubjects(), folderName);
    if (!subject) return;
    await this.deps.logSession(subject.id, endedAt, seconds);
  }
}
