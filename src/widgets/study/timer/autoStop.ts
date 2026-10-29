import type { AppCategory } from "../../../core/system/appCategory";

/**
 * Decide quando fermare da solo il timer dello Studio. Classe pura con orologio
 * iniettato (`now` passato a ogni chiamata): si testa senza browser.
 *
 * Chi la usa chiama `check()` ogni pochi secondi mentre il timer corre, con
 * l'inattività di sistema e la categoria dell'app in primo piano (già classificata).
 * Scatta in tre casi, tutti con la stessa soglia:
 *  - inattività di sistema ≥ soglia: lo studio è finito con l'ultimo input;
 *  - buco tra due check ≥ soglia (PC in sospensione, WebView congelato): finito all'ultimo check.
 *    Mai sotto i 3 minuti: a finestra ridotta a icona il WebView può rallentare i timer
 *    fino a un giro al minuto, e non è un'assenza;
 *  - app di una categoria "che distrae" in primo piano da ≥ soglia: finito quando è comparsa.
 * Le assenze più brevi della soglia non tolgono nulla: contano come studio.
 * Al 90% della soglia (inattività o app) arriva prima un preavviso, una volta per episodio.
 */
export interface AutoStopInput {
  /** Secondi dall'ultimo input di sistema; null se non disponibile. */
  idleSeconds: number | null;
  /** Categoria dell'app in primo piano; null se è la dashboard stessa o non si guarda. */
  category: AppCategory | null;
}

export interface AutoStopConfig {
  minutes: number;
  /** Categorie che fanno scattare lo stop; vuoto = solo inattività. */
  categories: ReadonlySet<AppCategory>;
}

export type AutoStopResult =
  | {
      type: "stop";
      reason: "idle" | "app";
      /** Solo per reason "app": la categoria che l'ha fatto scattare. */
      category: AppCategory | null;
      /** Istante (ms) in cui lo studio vero è finito. */
      stoppedAt: number;
    }
  | {
      type: "warn";
      reason: "idle" | "app";
      category: AppCategory | null;
      /** Da quanti secondi dura l'assenza (o l'app). */
      awaySeconds: number;
      /** Secondi che mancano allo stop. */
      secondsLeft: number;
    };

type StopResult = Extract<AutoStopResult, { type: "stop" }>;

const MIN_GAP_MS = 3 * 60_000;
/** Il preavviso arriva quando è passato questo pezzo della soglia. */
const WARN_AT = 0.9;

/** Un'istanza per ogni tratto in cui il timer corre: a ogni avvio, ripresa o cambio di fase se ne crea una nuova. */
export class AutoStopTracker {
  private lastCheckAt: number | null = null;
  private distractedSince: number | null = null;
  /** Inizio degli episodi già preavvisati: un preavviso per episodio. */
  private warnedIdleFrom: number | null = null;
  private warnedAppFrom: number | null = null;

  check(now: number, input: AutoStopInput, cfg: AutoStopConfig): AutoStopResult | null {
    const thresholdMs = Math.max(1, cfg.minutes) * 60_000;
    const candidates: StopResult[] = [];

    if (this.lastCheckAt !== null && now - this.lastCheckAt >= Math.max(thresholdMs, MIN_GAP_MS)) {
      candidates.push({ type: "stop", reason: "idle", category: null, stoppedAt: this.lastCheckAt });
    }
    this.lastCheckAt = now;

    if (input.idleSeconds !== null && input.idleSeconds * 1000 >= thresholdMs) {
      candidates.push({ type: "stop", reason: "idle", category: null, stoppedAt: now - input.idleSeconds * 1000 });
    }

    if (input.category !== null && cfg.categories.has(input.category)) {
      this.distractedSince ??= now;
      if (now - this.distractedSince >= thresholdMs) {
        candidates.push({ type: "stop", reason: "app", category: input.category, stoppedAt: this.distractedSince });
      }
    } else {
      this.distractedSince = null;
    }

    if (candidates.length > 0) return candidates.reduce((a, b) => (b.stoppedAt < a.stoppedAt ? b : a));
    return this.warning(now, input, thresholdMs);
  }

  private warning(now: number, input: AutoStopInput, thresholdMs: number): AutoStopResult | null {
    const warnMs = thresholdMs * WARN_AT;
    const warn = (reason: "idle" | "app", category: AppCategory | null, awayMs: number): AutoStopResult => ({
      type: "warn",
      reason,
      category,
      awaySeconds: Math.floor(awayMs / 1000),
      secondsLeft: Math.max(1, Math.ceil((thresholdMs - awayMs) / 1000)),
    });

    if (input.idleSeconds !== null && input.idleSeconds * 1000 >= warnMs) {
      // L'inizio dell'episodio oscilla di qualche ms tra due letture: lo si arrotonda al secondo.
      const from = Math.round((now - input.idleSeconds * 1000) / 1000);
      if (this.warnedIdleFrom === null || Math.abs(this.warnedIdleFrom - from) > 2) {
        this.warnedIdleFrom = from;
        return warn("idle", null, input.idleSeconds * 1000);
      }
    }
    if (this.distractedSince !== null && now - this.distractedSince >= warnMs && this.warnedAppFrom !== this.distractedSince) {
      this.warnedAppFrom = this.distractedSince;
      return warn("app", input.category, now - this.distractedSince);
    }
    return null;
  }
}
