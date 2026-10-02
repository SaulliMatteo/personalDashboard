import type { MouseEvent } from "react";
import { MdPlayArrow, MdPause } from "react-icons/md";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { useSettings } from "../../core/settings/SettingsContext";
import TimerRing from "./TimerRing";
import { useTimer } from "./TimerContext";
import { formatClock, formatHoursMinutes } from "./studyFormat";
import "./StudyWidget.css";

const PHASE_LABEL: Record<string, string> = {
  idle: "Pronto",
  work: "Studio",
  short_break: "Pausa",
  long_break: "Pausa lunga",
};

function StudyWidget({ w, h }: WidgetProps) {
  const { phase, displaySeconds, phaseTotalSeconds, isRunning, subjects, todayBySubject, pause, resume } = useTimer();
  const { settings } = useSettings();

  // La dashboard passa la taglia come props: il widget non deve più
  // cercarsi nel layout condiviso.
  const isLarge = w >= 2 && h >= 2;

  const isIdle = phase === "idle";
  const isBreak = phase === "short_break" || phase === "long_break";
  const clockSeconds = isIdle ? settings.pomodoroWorkMinutes * 60 : displaySeconds;
  const progress = isIdle || phaseTotalSeconds === 0 ? 0 : 1 - displaySeconds / phaseTotalSeconds;
  const ringColor = isIdle ? "var(--text-muted)" : isBreak ? "var(--study-break)" : "var(--accent)";

  function handleToggle(e: MouseEvent) {
    // Il click sul widget in dashboard apre la pagina di dettaglio: qui
    // fermiamo la propagazione perché questo bottone deve solo mettere
    // in pausa/riprendere, non navigare via.
    e.stopPropagation();
    if (isIdle) return;
    if (isRunning) pause();
    else resume();
  }

  return (
    <WidgetFrame>
      <article className={`widget study-widget ${isLarge ? "study-widget--large" : "study-widget--small"}`}>
        <div className="study-widget-body">
          <div className="study-widget-timer">
            <TimerRing progress={progress} size={isLarge ? 92 : 50} strokeWidth={isLarge ? 7 : 4} color={ringColor}>
              <span className="study-widget-clock">{formatClock(clockSeconds)}</span>
              {isLarge && <span className="study-widget-phase">{PHASE_LABEL[phase]}</span>}
            </TimerRing>

            {!isIdle && (
              <button
                type="button"
                className="study-widget-toggle"
                onClick={handleToggle}
                aria-label={isRunning ? "Metti in pausa" : "Riprendi"}
              >
                {isRunning ? <MdPause /> : <MdPlayArrow />}
              </button>
            )}
          </div>

          {isLarge && (
            <div className="study-widget-subjects">
              {subjects.length === 0 ? (
                <p className="study-widget-empty">Aggiungi materie dai dettagli del widget.</p>
              ) : (
                subjects.map((subject) => (
                  <div key={subject.id} className="study-widget-subject-row">
                    <span className="study-widget-subject-name">{subject.name}</span>
                    <span className="study-widget-subject-time">
                      {formatHoursMinutes(todayBySubject[subject.id] ?? 0)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </article>
    </WidgetFrame>
  );
}

export default StudyWidget;
