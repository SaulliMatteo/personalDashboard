import { useSettings } from "../../../core/settings/useSettings";
import { colorForSubject } from "../lib/colors";
import { formatClock, formatStopwatch } from "../lib/format";
import { useTimer } from "./useTimer";

const PHASE_LABEL: Record<string, string> = {
  idle: "Pronto",
  work: "Concentrazione",
  short_break: "Pausa breve",
  long_break: "Pausa lunga",
};

/**
 * Tutto ciò che serve per DISEGNARE il timer (testo, progresso, colore,
 * etichetta), calcolato in un solo posto: widget e pagina di dettaglio
 * restano coerenti e chi vuole cambiare l'aspetto del timer tocca solo qui.
 */
export function useTimerView() {
  const timer = useTimer();
  const { settings } = useSettings();
  const { phase, subjectId, subjects, displaySeconds, phaseTotalSeconds, isStopwatch } = timer;

  const activeIndex = subjects.findIndex((s) => s.id === subjectId);
  const activeSubject = activeIndex >= 0 ? subjects[activeIndex] : null;

  const isIdle = phase === "idle";
  const isBreak = phase === "short_break" || phase === "long_break";
  const isWork = phase === "work";

  const clockText = isIdle ? "00:00" : isStopwatch ? formatStopwatch(displaySeconds) : formatClock(displaySeconds);

  // Il cronometro non ha una fine: l'anello compie un giro ogni N minuti (impostazione).
  const lapSeconds = Math.max(1, settings.studyStopwatchLapMinutes) * 60;
  const progress = isIdle
    ? 0
    : isStopwatch
      ? (displaySeconds % lapSeconds) / lapSeconds
      : phaseTotalSeconds === 0
        ? 0
        : 1 - displaySeconds / phaseTotalSeconds;

  // Stesso colore per anello e sfondo sfumato: da fermo grigio, in pausa il
  // colore delle pause, in studio quello della materia.
  const ringColor = isIdle
    ? "var(--text-muted)"
    : isBreak
      ? "var(--study-break)"
      : colorForSubject(activeSubject, activeIndex);

  const phaseLabel = isStopwatch ? "Cronometro" : PHASE_LABEL[phase];

  return { ...timer, activeSubject, activeIndex, isIdle, isBreak, isWork, clockText, progress, ringColor, phaseLabel };
}
