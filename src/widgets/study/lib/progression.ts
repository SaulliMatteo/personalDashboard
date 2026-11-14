/*
 * Progressione dello studio (tema Ombra, scheda Rune): frammenti, nuclei, livelli, Prove, Serie e tratti.
 * Funzioni PURE: i giorni, gli obiettivi e le sessioni arrivano da fuori (progression/useProgression.ts), così si
 * provano con node: scripts/studio/progression.test.mts.
 *
 * Regole:
 * - 1 minuto di studio = 1 frammento (dalle sessioni registrate).
 * - Il nucleo n contiene n×1000 frammenti; quelli in eccesso vanno nel nucleo dopo. I nuclei sono 7.
 * - Livello I all'inizio; II col 1° nucleo pieno; III–VII con 2/3/4/6/7 nuclei pieni più la Prova di quel livello.
 * - La Prova si apre il giorno dopo che i nuclei richiesti sono pieni (e dopo il livello precedente): su 7 giorni ne
 *   servono 5 sull'obiettivo. L'esito si fissa appena è certo (5 riusciti oppure 3 mancati); se fallisce ne riparte
 *   una il giorno dopo. Senza nessun obiettivo nel piano la Prova non parte.
 * - Il livello non scende mai: vale il più alto tra quello calcolato e quello salvato (impostazione sincronizzata).
 * - Un giorno è "riuscito" se raggiunge il suo obiettivo; un giorno senza obiettivo (riposo previsto) conta come
 *   riuscito. Senza nessun obiettivo nel piano conta riuscito ogni giorno in cui si è studiato.
 * - Oggi non è mai "mancato" finché non finisce: non rompe la Serie e non conta come errore nella Prova.
 * - Serie: giorni riusciti di fila; i gradi I–VII arrivano a 1/3/7/14/30/60/100 giorni.
 * - Tratti sugli ultimi 30 giorni: Costante (una serie di almeno 7 giorni), Nottambulo (almeno un terzo dello studio
 *   tra le 22 e le 4), Mattiniero (almeno un terzo tra le 4 e le 8).
 */

export const FRAGMENTS_PER_CORE = 1000;
export const CORE_COUNT = 7;
export const MAX_LEVEL = 7;
/** Nuclei pieni richiesti per ogni livello (indice = livello). */
export const CORES_FOR_LEVEL = [0, 0, 1, 2, 3, 4, 6, 7] as const;
/** Giorni di Serie per i gradi I–VII. */
export const GRADE_THRESHOLDS = [1, 3, 7, 14, 30, 60, 100] as const;
export const TRIAL_DAYS = 7;
export const TRIAL_HITS = 5;
/** Con 3 giorni mancati i 5 riusciti non sono più possibili. */
export const TRIAL_MISSES = TRIAL_DAYS - TRIAL_HITS + 1;
const TRAIT_DAYS = 30;
/** Sotto questo studio (s) negli ultimi 30 giorni gli orari non dicono nulla: niente Nottambulo né Mattiniero. */
const TRAIT_MIN_SECONDS = 3600;

export type Trait = "Costante" | "Nottambulo" | "Mattiniero";

export interface ProgressDay {
  /** Inizio del giorno locale (ms). */
  dayStart: number;
  /** Secondi studiati quel giorno. */
  seconds: number;
  /** Obiettivo di quel giorno (s, lib/schedule.ts); 0 = nessuno. */
  goalSeconds: number;
}

export interface ProgressSession {
  startedAt: number;
  endedAt: number;
}

export interface ProgressionInput {
  /** Un elemento per giorno, senza buchi, dal primo giorno di studio a oggi (l'ultimo è oggi). */
  days: readonly ProgressDay[];
  /** Vero se il piano ha almeno un obiettivo (una materia con obiettivo o l'obiettivo generale). */
  hasGoal: boolean;
  /** Livello più alto già raggiunto (salvato): il livello non scende mai sotto. */
  storedLevel: number;
  /** Sessioni degli ultimi 30 giorni, per i tratti. */
  recentSessions: readonly ProgressSession[];
}

export type TrialDay = "hit" | "miss" | "today" | "future";

export interface TrialState {
  /** Il livello che si conquista superandola. */
  level: number;
  /** "running": in corso; "opens": si apre domani; "needsGoal": manca un obiettivo, non parte. */
  status: "running" | "opens" | "needsGoal";
  /** Primo giorno della Prova (ms), se è partita. */
  startDay: number | null;
  hits: number;
  misses: number;
  /** I 7 giorni della Prova in corso. */
  days: TrialDay[];
  /** Prove di questo livello già fallite. */
  failures: number;
}

export interface Progression {
  fragments: number;
  todayFragments: number;
  todayGoalFragments: number;
  /** Nuclei pieni (0–7). */
  fullCores: number;
  /** Frammenti nel nucleo che si sta riempiendo e la sua capienza (0/0 con tutti e 7 pieni). */
  coreFill: number;
  coreCap: number;
  level: number;
  /** Cosa serve per il livello dopo; null al livello massimo. */
  next: { level: number; cores: number; trial: boolean } | null;
  /** La Prova in corso o in arrivo; null se i nuclei del prossimo livello non sono ancora pieni. */
  trial: TrialState | null;
  streak: number;
  /** Grado della Serie, 0–7 (0 = nessuna serie). */
  grade: number;
  /** Giorni che mancano al grado dopo; null al grado massimo. */
  nextGradeIn: number | null;
  traits: Trait[];
}

/** Inizio (ms) del giorno locale di `ms`. */
export function dayStartOf(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Gli inizi dei giorni locali da quello di `fromMs` a quello di `toMs` compresi. Con `setDate`, non sommando 24 h:
 * col cambio dell'ora legale un giorno dura 23 o 25 ore (come getDailyTotals in data/studyRepository.ts).
 */
export function dayStartsBetween(fromMs: number, toMs: number): number[] {
  const end = dayStartOf(toMs);
  const d = new Date(dayStartOf(fromMs));
  const starts: number[] = [];
  while (d.getTime() <= end) {
    starts.push(d.getTime());
    d.setDate(d.getDate() + 1);
  }
  return starts;
}

/** Secondi per giorno: una sessione conta nel giorno in cui finisce (come il resto dello Studio). */
export function secondsPerDay(starts: readonly number[], sessions: readonly { endedAt: number; durationSeconds: number }[]): number[] {
  const totals = starts.map(() => 0);
  for (const s of sessions) {
    let i = starts.length - 1;
    while (i > 0 && s.endedAt < starts[i]) i--;
    if (i >= 0 && s.endedAt >= starts[0]) totals[i] += s.durationSeconds;
  }
  return totals;
}

/** Frammenti che riempiono i primi `n` nuclei: 1000 + 2000 + … + n×1000. */
export function fragmentsForCores(n: number): number {
  return (FRAGMENTS_PER_CORE * n * (n + 1)) / 2;
}

/** Nuclei pieni con `fragments` frammenti, e il riempimento di quello dopo. */
export function coresOf(fragments: number): { full: number; fill: number; cap: number } {
  let full = 0;
  while (full < CORE_COUNT && fragments >= fragmentsForCores(full + 1)) full++;
  if (full === CORE_COUNT) return { full, fill: 0, cap: 0 };
  return { full, fill: fragments - fragmentsForCores(full), cap: (full + 1) * FRAGMENTS_PER_CORE };
}

export function toFragments(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / 60);
}

/** Il giorno è riuscito? (vedi le regole in cima). */
export function isHit(day: ProgressDay, hasGoal: boolean): boolean {
  if (!hasGoal) return day.seconds > 0;
  return day.goalSeconds <= 0 || day.seconds >= day.goalSeconds;
}

export function gradeOf(streak: number): number {
  return GRADE_THRESHOLDS.filter((t) => streak >= t).length;
}

/** "I" … "VII". */
export function roman(n: number): string {
  return ["", "I", "II", "III", "IV", "V", "VI", "VII"][Math.min(7, Math.max(0, Math.floor(n)))] ?? "";
}

/** Serie in corso: giorni riusciti di fila fino a ieri, più oggi se è già riuscito. */
export function currentStreak(days: readonly ProgressDay[], hasGoal: boolean): number {
  let i = days.length - 1;
  let streak = 0;
  if (i >= 0 && isHit(days[i], hasGoal)) streak++;
  for (i--; i >= 0 && isHit(days[i], hasGoal); i--) streak++;
  return streak;
}

/** La serie più lunga tra gli ultimi `span` giorni (oggi compreso solo se già riuscito). */
function bestStreak(days: readonly ProgressDay[], hasGoal: boolean, span: number): number {
  let best = 0;
  let run = 0;
  for (const day of days.slice(-span)) {
    run = isHit(day, hasGoal) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Secondi di studio nelle fasce di notte (22–4) e di mattina (4–8), ora locale, minuto per minuto. */
function hourShares(sessions: readonly ProgressSession[]): { total: number; night: number; morning: number } {
  let total = 0;
  let night = 0;
  let morning = 0;
  for (const s of sessions) {
    for (let t = s.startedAt; t < s.endedAt; t += 60_000) {
      const step = Math.min(60_000, s.endedAt - t) / 1000;
      const hour = new Date(t).getHours();
      total += step;
      if (hour >= 22 || hour < 4) night += step;
      else if (hour < 8) morning += step;
    }
  }
  return { total, night, morning };
}

export function traitsOf(days: readonly ProgressDay[], hasGoal: boolean, sessions: readonly ProgressSession[]): Trait[] {
  const traits: Trait[] = [];
  if (bestStreak(days, hasGoal, TRAIT_DAYS) >= 7) traits.push("Costante");
  const { total, night, morning } = hourShares(sessions);
  if (total >= TRAIT_MIN_SECONDS) {
    if (night * 3 >= total) traits.push("Nottambulo");
    if (morning * 3 >= total) traits.push("Mattiniero");
  }
  return traits;
}

/** Frammenti che mancano per i nuclei del livello dopo (0 se sono già pieni o se si è al massimo). */
export function fragmentsToNext(p: Progression): number {
  if (!p.next) return 0;
  return Math.max(0, fragmentsForCores(p.next.cores) - p.fragments);
}

/** Una riga su cosa viene dopo: card delle rune nella barra laterale e scheda Rune. */
export function nextStepText(p: Progression): string {
  if (!p.next) return "Livello massimo raggiunto";
  const label = `livello ${roman(p.next.level)}`;
  if (p.trial?.status === "running") return `Prova del ${label}: ${p.trial.hits} giorni su ${TRIAL_HITS}`;
  if (p.trial?.status === "opens") return `La Prova del ${label} si apre domani`;
  if (p.trial?.status === "needsGoal") return "Imposta un obiettivo giornaliero per la Prova";
  const missing = fragmentsToNext(p);
  const what = p.next.trial ? `Prova del ${label}` : `Livello ${roman(p.next.level)}`;
  return `${what} tra ${missing} ${missing === 1 ? "frammento" : "frammenti"}`;
}

export function computeProgression(input: ProgressionInput): Progression {
  const { days, hasGoal } = input;
  const today = days.length - 1;
  // frammenti accumulati alla fine di ogni giorno
  const cumulative: number[] = [];
  let seconds = 0;
  for (const day of days) {
    seconds += day.seconds;
    cumulative.push(toFragments(seconds));
  }
  const fragments = cumulative[today] ?? 0;
  const stored = Math.min(MAX_LEVEL, Math.max(1, Math.floor(input.storedLevel) || 1));
  const firstFull = (cores: number) => cumulative.findIndex((f) => f >= fragmentsForCores(cores));

  let level = 1;
  // giorno (indice) in cui si è raggiunto il livello attuale; -1 = prima del primo giorno
  let reachedAt = -1;
  let trial: TrialState | null = null;

  for (let target = 2; target <= MAX_LEVEL && trial === null; target++) {
    const saturated = firstFull(CORES_FOR_LEVEL[target]);
    if (target <= stored) {
      // già raggiunto (anche su un altro dispositivo, o con obiettivi che poi sono cambiati)
      level = target;
      reachedAt = Math.max(reachedAt, saturated);
      continue;
    }
    if (saturated < 0) break;
    if (target === 2) {
      level = 2;
      reachedAt = saturated;
      continue;
    }
    let start = Math.max(saturated, reachedAt) + 1;
    if (start > today) {
      trial = { level: target, status: "opens", startDay: null, hits: 0, misses: 0, days: [], failures: 0 };
      break;
    }
    if (!hasGoal) {
      trial = { level: target, status: "needsGoal", startDay: null, hits: 0, misses: 0, days: [], failures: 0 };
      break;
    }
    let failures = 0;
    let passed = false;
    while (!passed && trial === null) {
      let hits = 0;
      let misses = 0;
      const marks: TrialDay[] = [];
      let d = start;
      for (; d <= today; d++) {
        const hit = isHit(days[d], hasGoal);
        if (hit) hits++;
        else if (d < today) misses++;
        marks.push(hit ? "hit" : d < today ? "miss" : "today");
        if (hits >= TRIAL_HITS || misses >= TRIAL_MISSES) break;
      }
      if (hits >= TRIAL_HITS) {
        passed = true;
        level = target;
        reachedAt = d;
      } else if (misses >= TRIAL_MISSES) {
        failures++;
        start = d + 1;
        if (start > today) {
          trial = { level: target, status: "opens", startDay: null, hits: 0, misses: 0, days: [], failures };
        }
      } else {
        while (marks.length < TRIAL_DAYS) marks.push("future");
        trial = { level: target, status: "running", startDay: days[start].dayStart, hits, misses, days: marks, failures };
      }
    }
  }
  level = Math.max(level, stored);

  const cores = coresOf(fragments);
  const nextLevel = level + 1;
  const todayDay = days[today];
  const streak = currentStreak(days, hasGoal);
  const grade = gradeOf(streak);
  return {
    fragments,
    todayFragments: todayDay ? toFragments(todayDay.seconds) : 0,
    todayGoalFragments: todayDay ? toFragments(todayDay.goalSeconds) : 0,
    fullCores: cores.full,
    coreFill: cores.fill,
    coreCap: cores.cap,
    level,
    next: nextLevel > MAX_LEVEL ? null : { level: nextLevel, cores: CORES_FOR_LEVEL[nextLevel], trial: nextLevel >= 3 },
    trial: trial && trial.level === nextLevel ? trial : null,
    streak,
    grade,
    nextGradeIn: grade >= GRADE_THRESHOLDS.length ? null : GRADE_THRESHOLDS[grade] - streak,
    traits: traitsOf(days, hasGoal, input.recentSessions),
  };
}
