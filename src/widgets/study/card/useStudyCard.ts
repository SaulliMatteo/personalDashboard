import { useEffect, useState } from "react";
import { getDailyTotals, type Subject } from "../data/studyRepository";
import { colorForSubject } from "../lib/colors";
import { formatHoursMinutes } from "../lib/format";
import { dayName, daysLabel, isScheduledOn, isTodaySubject } from "../lib/schedule";
import { useTimerView } from "../timer/useTimerView";

/** Iniziale del giorno della settimana, indicizzata come Date.getDay() (0 = domenica). */
const DAY_INITIALS = ["D", "L", "M", "M", "G", "V", "S"];

export interface SubjectRow {
  subject: Subject;
  color: string;
  seconds: number;
  /** Obiettivo della materia in secondi (0 = nessuno). */
  goalSeconds: number;
  /** Avanzamento verso l'obiettivo (0..1; 0 senza obiettivo). */
  goalProgress: number;
  /** Obiettivo presente e raggiunto. */
  isDone: boolean;
  /**
   * Lunghezza della barra (0..1): l'avanzamento verso l'obiettivo se la materia ne ha uno,
   * altrimenti il tempo di oggi rispetto alla materia più studiata oggi.
   */
  share: number;
  isActive: boolean;
}

/** Una materia non prevista oggi, sotto "Altre materie". */
export interface OtherRow {
  subject: Subject;
  color: string;
  /** I suoi giorni, es. "lun, mer". */
  daysText: string;
  isActive: boolean;
}

export interface WeekDay {
  initial: string;
  seconds: number;
  /** Rispetto al giorno più studiato della settimana (0..1): altezza della barra. */
  share: number;
  isToday: boolean;
}

export interface CycleInfo {
  /** Pomodori prima della pausa lunga. */
  total: number;
  /** Pomodori già completati in questo giro. */
  done: number;
  /** True se un pomodoro è in corso (il pallino "attuale"). */
  inProgress: boolean;
  /** "Ciclo 3 di 4". */
  label: string;
}

/**
 * Tutto ciò che serve alle card del widget Studio, in ogni tema e taglia:
 * dati del timer, materie di oggi, cicli, ultimi 7 giorni e le due azioni.
 * Le card decidono solo COME disegnarlo.
 */
export function useStudyCard({ withWeek = false }: { withWeek?: boolean } = {}) {
  const view = useTimerView();
  const {
    subjects, todayBySubject, dayStart, todayGoalSeconds, subjectId, activeSubject, isIdle, isWork, isBreak, isRunning,
    isStopwatch, cycleCount, displaySeconds, phase, startWork, pause, resume, stopOrSkip, switchSubject,
  } = view;
  // Pop-up "Altre materie" aperto o chiuso: solo in memoria, ogni card ha il suo.
  const [othersOpen, setOthersOpen] = useState(false);

  const todaySeconds = Object.values(todayBySubject).reduce((sum, v) => sum + v, 0);
  // L'obiettivo di oggi lo calcola TimerContext (lib/schedule.ts), lo stesso per dettaglio e barra laterale.
  const goalSeconds = todayGoalSeconds;
  const goalProgress = goalSeconds > 0 ? Math.min(1, todaySeconds / goalSeconds) : 0;

  // Di oggi: le previste oggi, più quelle già studiate oggi (il totale deve tornare con le righe) e quella in corso.
  // Le ultime due non contano nell'obiettivo del giorno. Il colore usa l'indice nell'elenco completo.
  const today = new Date(dayStart);
  const maxSubjectSeconds = Math.max(0, ...subjects.map((s) => todayBySubject[s.id] ?? 0));
  const rows: SubjectRow[] = [];
  const otherRows: OtherRow[] = [];
  subjects.forEach((subject, index) => {
    const seconds = todayBySubject[subject.id] ?? 0;
    const color = colorForSubject(subject, index);
    const isActive = subject.id === subjectId;
    if (!isTodaySubject(subject, today, seconds, isActive)) {
      otherRows.push({ subject, color, daysText: daysLabel(subject.studyDays), isActive });
      return;
    }
    const subjectGoal = subject.dailyGoalMinutes * 60;
    const subjectProgress = subjectGoal > 0 ? Math.min(1, seconds / subjectGoal) : 0;
    rows.push({
      subject,
      color,
      seconds,
      goalSeconds: subjectGoal,
      goalProgress: subjectProgress,
      isDone: subjectGoal > 0 && seconds >= subjectGoal,
      share: subjectGoal > 0 ? subjectProgress : maxSubjectSeconds > 0 ? seconds / maxSubjectSeconds : 0,
      isActive,
    });
  });
  // Materie di oggi con un obiettivo proprio (le altre non lo hanno o non contano).
  const goalSubjectCount = subjects.filter((s) => s.dailyGoalMinutes > 0 && isScheduledOn(s, today)).length;

  // Materia di riferimento: quella del timer o, da fermo, la prima di oggi (poi la prima delle altre).
  const currentSubject = activeSubject ?? rows[0]?.subject ?? otherRows[0]?.subject ?? null;

  /** Le righe di oggi che ci stanno in una card da `max` righe: il pulsante "Altre" (se c'è) ne prende una. */
  function fitRows(max: number): SubjectRow[] {
    return visibleRows(rows, otherRows.length > 0 ? max - 1 : max);
  }

  let cycles: CycleInfo | null = null;
  if (!isIdle && !isStopwatch && currentSubject) {
    const total = Math.max(1, currentSubject.cyclesBeforeLongBreak);
    // In pausa il contatore è già avanzato: dopo la pausa lunga il giro è completo.
    const done = isWork ? cycleCount % total : cycleCount % total || total;
    cycles = { total, done, inProgress: isWork, label: `Ciclo ${isWork ? done + 1 : done} di ${total}` };
  }

  // Quanto manca al prossimo cambio di fase, in minuti.
  const minutesLeft = Math.max(1, Math.ceil(displaySeconds / 60));
  const minutesText = `${minutesLeft} ${minutesLeft === 1 ? "minuto" : "minuti"}`;
  let nextPhaseText: string | null = null;
  if (cycles && isWork) {
    const isLong = (cycleCount + 1) % cycles.total === 0;
    nextPhaseText = `Pausa ${isLong ? "lunga" : "breve"} tra ${minutesText}`;
  } else if (isBreak) {
    nextPhaseText = `Si riprende tra ${minutesText}`;
  }
  const nextPhaseShort = cycles && isWork ? `Pausa tra ${minutesLeft} min.` : isBreak ? `Si riprende tra ${minutesLeft} min.` : null;

  // Ultimi 7 giorni: si rileggono quando cambia il totale di oggi (sessione registrata).
  const [weekTotals, setWeekTotals] = useState<{ dayStart: number; seconds: number }[]>([]);
  useEffect(() => {
    if (!withWeek) return;
    let cancelled = false;
    getDailyTotals(7)
      .then((totals) => {
        if (!cancelled) setWeekTotals(totals);
      })
      .catch((error) => console.error("Errore nel caricamento degli ultimi 7 giorni:", error));
    return () => {
      cancelled = true;
    };
  }, [withWeek, todaySeconds]);
  const maxDay = Math.max(0, ...weekTotals.map((d) => d.seconds));
  const week: WeekDay[] = weekTotals.map((d, i) => ({
    initial: DAY_INITIALS[new Date(d.dayStart).getDay()],
    seconds: d.seconds,
    share: maxDay > 0 ? d.seconds / maxDay : 0,
    isToday: i === weekTotals.length - 1,
  }));
  const weekSeconds = weekTotals.reduce((sum, d) => sum + d.seconds, 0);

  const canStart = currentSubject !== null;
  const primaryLabel = isIdle ? "Inizia" : isRunning ? "Metti in pausa" : "Riprendi";
  const secondaryLabel = isBreak ? "Salta la pausa" : "Ferma";

  function primaryAction() {
    if (isIdle) {
      if (currentSubject) void startWork(currentSubject.id);
    } else if (isRunning) pause();
    else resume();
  }

  function secondaryAction() {
    if (!isIdle) void stopOrSkip();
  }

  return {
    ...view,
    phase,
    currentSubject,
    todaySeconds,
    todayText: formatHoursMinutes(todaySeconds),
    goalSeconds,
    goalProgress,
    /** "4h 00m"; null senza obiettivo. */
    goalText: goalSeconds > 0 ? formatHoursMinutes(goalSeconds) : null,
    goalSubjectCount,
    /** Nome del giorno, es. "mercoledì". */
    todayName: dayName(today),
    rows,
    otherRows,
    fitRows,
    /** Testo dell'elenco vuoto: nessuna materia, oppure nessuna prevista oggi (le altre restano sotto "Altre"). */
    emptyText: !view.ready ? "" : otherRows.length > 0 ? "Nessuna materia prevista oggi." : "Aggiungi materie dai dettagli del widget.",
    othersOpen,
    openOthers: () => setOthersOpen(true),
    closeOthers: () => setOthersOpen(false),
    cycles,
    nextPhaseText,
    nextPhaseShort,
    week,
    weekSeconds,
    canStart,
    primaryLabel,
    secondaryLabel,
    primaryAction,
    secondaryAction,
    switchSubject,
    /** Testo letto dagli screen reader per la cella 1×1, es. "Studio, 18:42, metti in pausa". */
    cellLabel: `Studio, ${view.clockText}, ${primaryLabel.toLowerCase()}`,
  };
}

export type StudyCardData = ReturnType<typeof useStudyCard>;

/**
 * Le materie da mostrare quando non ci stanno tutte: l'ordine resta quello
 * dell'elenco, ma la materia in corso non resta mai fuori.
 */
export function visibleRows(rows: SubjectRow[], max: number): SubjectRow[] {
  if (rows.length <= max) return rows;
  const head = rows.slice(0, max);
  const active = rows.find((r) => r.isActive);
  if (active && !head.includes(active)) head[max - 1] = active;
  return head;
}
