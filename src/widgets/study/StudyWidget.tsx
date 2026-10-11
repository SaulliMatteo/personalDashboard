import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { MdOutlineAvTimer, MdPause, MdPlayArrow, MdSkipNext, MdStop } from "react-icons/md";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { useSettings } from "../../core/settings/SettingsContext";
import TimerRing from "./components/TimerRing";
import { colorForSubject } from "./lib/colors";
import { formatHoursMinutes } from "./lib/format";
import { useTimerView } from "./timer/useTimerView";
import "./StudyWidget.css";

function StudyWidget({ w, h }: WidgetProps) {
  const {
    isIdle, isWork, isRunning, subjectId, subjects, todayBySubject, ready,
    clockText, progress, ringColor, phaseLabel, pause, resume, stopOrSkip, switchSubject,
  } = useTimerView();
  const { settings } = useSettings();

  // La dashboard passa la taglia come props: il widget non deve cercarsi nel layout.
  const isLarge = w >= 2 && h >= 2;
  const showSubjects = isLarge && settings.studyShowSubjectsInWidget;

  // Nel 1x1 l'anello riempie lo spazio reale della card: la riga della
  // griglia è proporzionale alla larghezza, quindi l'altezza varia con la finestra.
  const smallBodyRef = useRef<HTMLDivElement | null>(null);
  const [smallRingSize, setSmallRingSize] = useState(88);
  useLayoutEffect(() => {
    const el = smallBodyRef.current;
    if (!el) return;
    const update = () => {
      const side = Math.min(el.clientWidth, el.clientHeight) - 6;
      setSmallRingSize(Math.max(56, Math.min(150, Math.round(side))));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isLarge]);

  // Sfondo sfumato del colore della materia (trasparente da fermo): nel
  // 1x1 copre tutta la card, nel 2x2 solo il pannello del timer.
  const glowStyle = { "--timer-glow": isIdle ? "transparent" : ringColor } as CSSProperties;

  const todayTotalSeconds = Object.values(todayBySubject).reduce((sum, v) => sum + v, 0);
  const goalSeconds = settings.studyDailyGoalMinutes * 60;
  const goalProgress = goalSeconds > 0 ? Math.min(1, todayTotalSeconds / goalSeconds) : 0;

  // I click su questi controlli non devono aprire la pagina di dettaglio
  // (che si apre cliccando il widget): fermiamo la propagazione.
  function handleToggle(e: MouseEvent) {
    e.stopPropagation();
    if (isIdle) return;
    if (isRunning) pause();
    else resume();
  }

  function handleStop(e: MouseEvent) {
    e.stopPropagation();
    void stopOrSkip();
  }

  const controls = (size: "normal" | "tiny") => {
    const cls = `study-widget-toggle${size === "tiny" ? " study-widget-toggle--tiny" : ""}`;
    return (
      <>
        <button type="button" className={cls} onClick={handleToggle} aria-label={isRunning ? "Metti in pausa" : "Riprendi"}>
          {isRunning ? <MdPause /> : <MdPlayArrow />}
        </button>
        {(
          <button type="button" className={`${cls} study-widget-toggle--muted`} onClick={handleStop} aria-label={isWork ? "Ferma" : "Salta pausa"}>
            {isWork ? <MdStop /> : <MdSkipNext />}
          </button>
        )}
      </>
    );
  };

  return (
    <WidgetFrame>
      <article
        className={`widget study-widget ${isLarge ? "study-widget--large" : "study-widget--small"}${showSubjects ? "" : " study-widget--ring-only"}`}
        style={isLarge ? undefined : glowStyle}
      >
        {isLarge ? (
          <div className="study-widget-body">
            <div className="study-widget-timer" style={glowStyle}>
              <TimerRing progress={progress} size={92} strokeWidth={7} color={ringColor}>
                <span className="study-widget-clock">{clockText}</span>
                <span className="study-widget-phase">{phaseLabel}</span>
              </TimerRing>
              {!isIdle && <div className="study-widget-controls-row">{controls("normal")}</div>}
            </div>

            {showSubjects && (
              <div className="study-widget-subjects">
                <div className="study-widget-subjects-head">
                  <span>Oggi</span>
                  <span className="study-widget-subjects-total">{formatHoursMinutes(todayTotalSeconds)}</span>
                </div>

                {goalSeconds > 0 && (
                  <div className="study-widget-goal" title={`Obiettivo ${formatHoursMinutes(goalSeconds)}`}>
                    <div className="study-widget-goal-bar" style={{ width: `${goalProgress * 100}%` }} />
                  </div>
                )}

                {subjects.length === 0 ? (
                  <p className="study-widget-empty">{ready ? "Aggiungi materie dai dettagli del widget." : ""}</p>
                ) : (
                  <div className="study-widget-subject-list">
                    {subjects.map((subject, index) => {
                      const color = colorForSubject(subject, index);
                      const isActive = subject.id === subjectId;
                      return (
                        <button
                          key={subject.id}
                          type="button"
                          className={`study-widget-subject-row${isActive ? " is-active" : ""}`}
                          style={{ "--subject-color": color } as CSSProperties}
                          disabled={isActive && isWork}
                          onClick={(e) => {
                            e.stopPropagation();
                            void switchSubject(subject.id);
                          }}
                          title={isIdle ? `Studia ${subject.name}` : isActive && isWork ? "Materia in corso" : `Chiudi la sessione e passa a ${subject.name}`}
                        >
                          <span className="study-widget-subject-name">{subject.name}</span>
                          {subject.mode === "stopwatch" && <MdOutlineAvTimer className="study-widget-subject-mode" />}
                          <span className="study-widget-subject-time">{formatHoursMinutes(todayBySubject[subject.id] ?? 0)}</span>
                          <span className="study-widget-subject-play">
                            <MdPlayArrow />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // 1x1: anello aperto in basso (gapDegrees); i controlli stanno
          // proprio nell'apertura, dentro il cerchio.
          <div className="study-widget-body study-widget-body--small" ref={smallBodyRef}>
            <div className="study-widget-ring-wrap">
              <TimerRing
                progress={progress}
                size={smallRingSize}
                strokeWidth={Math.max(5, Math.round(smallRingSize * 0.07))}
                color={ringColor}
                gapDegrees={104}
              >
                <span className="study-widget-clock" style={{ fontSize: Math.round(smallRingSize * 0.2) }}>
                  {clockText}
                </span>
              </TimerRing>

              {!isIdle && (
                <div className="study-widget-ring-controls" style={{ bottom: Math.round(smallRingSize * 0.05) }}>
                  {controls("tiny")}
                </div>
              )}
            </div>
          </div>
        )}
      </article>
    </WidgetFrame>
  );
}

export default StudyWidget;
