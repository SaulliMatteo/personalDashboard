import type { MouseEvent } from "react";
import { MdPlayArrow, MdPause, MdStop, MdSkipNext } from "react-icons/md";
import BorderGlow from "../import/BorderGlow";
import TimerRing from "../study/TimerRing";
import { useTimer } from "../../context/TimerContext";
import { useLayout } from "../../context/LayoutContext";
import { useSettings } from "../../context/SettingContext";
import { formatClock, formatHoursMinutes, colorForSubjectIndex } from "../../widgets/studyFormat";
import "../../css/StudyWidget.css";

const PHASE_LABEL: Record<string, string> = {
  idle: "Pronto",
  work: "Studio",
  short_break: "Pausa",
  long_break: "Pausa lunga",
};

function StudyWidget() {
  const { phase, displaySeconds, phaseTotalSeconds, isRunning, subjects, todayBySubject, pause, resume, stopOrSkip } =
    useTimer();
  const { layout } = useLayout();
  const { settings } = useSettings();

  // Il widget non riceve la propria taglia come prop (gli altri widget
  // non ne hanno bisogno): la troviamo cercando la nostra stessa voce nel
  // layout condiviso, tramite l'id "study" registrato in registry.tsx.
  const self = layout.find((item) => item.i === "study");
  const isLarge = (self?.w ?? 1) >= 2 && (self?.h ?? 1) >= 2;

  const isIdle = phase === "idle";
  const isWork = phase === "work";
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

  function handleStop(e: MouseEvent) {
    e.stopPropagation();
    stopOrSkip();
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
        {isLarge ? (
          <div className="study-widget-body">
            <div className="study-widget-timer">
              <TimerRing progress={progress} size={92} strokeWidth={7} color={ringColor}>
                <span className="study-widget-clock">{formatClock(clockSeconds)}</span>
                <span className="study-widget-phase">{PHASE_LABEL[phase]}</span>
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

            <div className="study-widget-subjects">
              {subjects.length === 0 ? (
                <p className="study-widget-empty">Aggiungi materie dai dettagli del widget.</p>
              ) : (
                subjects.map((subject, index) => (
                  <div key={subject.id} className="study-widget-subject-row">
                    <span className="study-widget-subject-dot" style={{ background: colorForSubjectIndex(index) }} />
                    <span className="study-widget-subject-name">{subject.name}</span>
                    <span className="study-widget-subject-time">
                      {formatHoursMinutes(todayBySubject[subject.id] ?? 0)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          // Taglia piccola: l'anello non si chiude in basso (gapDegrees):
          // al posto della chiusura, in quell'apertura, ci stanno i
          // controlli play/pausa e ferma — dentro al cerchio, non tagliati
          // dal bordo della card.
          <div className="study-widget-body study-widget-body--small">
            <div className="study-widget-ring-wrap">
              <TimerRing progress={progress} size={70} strokeWidth={5} color={ringColor} gapDegrees={104}>
                <span className="study-widget-clock">{formatClock(clockSeconds)}</span>
              </TimerRing>

              {!isIdle && (
                <div className="study-widget-ring-controls">
                  <button
                    type="button"
                    className="study-widget-toggle study-widget-toggle--tiny"
                    onClick={handleToggle}
                    aria-label={isRunning ? "Metti in pausa" : "Riprendi"}
                  >
                    {isRunning ? <MdPause /> : <MdPlayArrow />}
                  </button>
                  <button
                    type="button"
                    className="study-widget-toggle study-widget-toggle--tiny study-widget-toggle--muted"
                    onClick={handleStop}
                    aria-label={isWork ? "Ferma" : "Salta pausa"}
                  >
                    {isWork ? <MdStop /> : <MdSkipNext />}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </article>
    </BorderGlow>
  );
}

export default StudyWidget;
