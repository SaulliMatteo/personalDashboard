import { useEffect, useState } from "react";
import { useSettings } from "../../../core/settings/SettingsContext";
import { getDailyTotals, type Subject } from "../data/studyRepository";
import { colorForSubject } from "../lib/colors";
import { formatHoursMinutes } from "../lib/format";
import { useTimerView } from "../timer/useTimerView";

/** Iniziale del giorno della settimana, indicizzata come Date.getDay() (0 = domenica). */
const DAY_INITIALS = ["D", "L", "M", "M", "G", "V", "S"];

export interface SubjectRow {
  subject: Subject;
  color: string;
  seconds: number;
  /** Tempo di oggi rispetto alla materia più studiata oggi (0..1): lunghezza della barra. */
  share: number;
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
  const { settings } = useSettings();
  const {
    subjects, todayBySubject, subjectId, activeSubject, isIdle, isWork, isBreak, isRunning, isStopwatch,
    cycleCount, displaySeconds, phase, startWork, pause, resume, stopOrSkip, switchSubject,
  } = view;

  // Materia di riferimento: quella del timer o, da fermo, la prima dell'elenco.
  const currentSubject = activeSubject ?? subjects[0] ?? null;

  const todaySeconds = Object.values(todayBySubject).reduce((sum, v) => sum + v, 0);
  const goalSeconds = settings.studyDailyGoalMinutes * 60;
  const goalProgress = goalSeconds > 0 ? Math.min(1, todaySeconds / goalSeconds) : 0;

  const maxSubjectSeconds = Math.max(0, ...subjects.map((s) => todayBySubject[s.id] ?? 0));
  const rows: SubjectRow[] = subjects.map((subject, index) => {
    const seconds = todayBySubject[subject.id] ?? 0;
    return {
      subject,
      color: colorForSubject(subject, index),
      seconds,
      share: maxSubjectSeconds > 0 ? seconds / maxSubjectSeconds : 0,
      isActive: subject.id === subjectId,
    };
  });

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
    rows,
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
