import type { MouseEvent } from "react";
import { MdPlayArrow, MdPause } from "react-icons/md";
import BorderGlow from "../import/BorderGlow";
import TimerRing from "../study/TimerRing";
import { useTimer } from "../../context/TimerContext";
import { useLayout } from "../../context/LayoutContext";
import { useSettings } from "../../context/SettingContext";
import { formatClock, formatHoursMinutes } from "../../widgets/studyFormat";
import "../../css/StudyWidget.css";

const PHASE_LABEL: Record<string, string> = {
  idle: "Pronto",
  work: "Studio",
  short_break: "Pausa",
  long_break: "Pausa lunga",
};

function StudyWidget() {
  const { phase, displaySeconds, phaseTotalSeconds, isRunning, subjects, todayBySubject, pause, resume } =
    useTimer();
  const { layout } = useLayout();
  const { settings } = useSettings();

  // Il widget non riceve la propria taglia come prop (gli altri widget
  // non ne hanno bisogno): la troviamo cercando la nostra stessa voce nel
  // layout condiviso, tramite l'id "study" registrato in registry.tsx.
  const self = layout.find((item) => item.i === "study");
  const isLarge = (self?.w ?? 1) >= 2 && (self?.h ?? 1) >= 2;

  const isIdle = phase === "idle";
  const isBreak = phase === "short_break" || phase === "long_break";
  const idlePreviewSeconds = (settings?.pomodoroWorkMinutes ?? 25) * 60;
  const clockSeconds = isIdle ? idlePreviewSeconds : displaySeconds;
  const progress = isIdle || phaseTotalSeconds === 0 ? 0 : 1 - displaySeconds / phaseTotalSeconds;
  const ringColor = isIdle ? "var(--text-muted)" : isBreak ? "var(--study-break)" : "var(--accent)";

  function handleToggle(e: MouseEvent) {
    // Il click sul widget in dashboard apre la pagina di dettaglio (vedi
    // Dashboard.tsx): qui fermiamo la propagazione perché questo bottone
    // deve solo mettere in pausa/riprendere, non navigare via.
    e.stopPropagation();
    if (isIdle) return;
    if (isRunning) pause();
    else resume();
  }

  return (
    <BorderGlow
      edgeSensitivity={24}
      glowColor="40 80 80"
      backgroundColor="#000"
      borderRadius={14}
      glowRadius={33}
      glowIntensity={0.7}
      coneSpread={25}
      animated={true}
      colors={["#c084fc", "#f472b6", "#38bdf8"]}
    >
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
    </BorderGlow>
  );
}

export default StudyWidget;
