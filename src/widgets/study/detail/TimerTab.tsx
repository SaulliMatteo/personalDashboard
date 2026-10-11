import { useEffect, useState, type CSSProperties } from "react";
import { MdOutlineCheckCircle, MdOutlineStarBorder, MdOutlineTimer, MdPause, MdPlayArrow, MdSkipNext, MdStop } from "react-icons/md";
import { useSettings } from "../../../core/settings/SettingsContext";
import TimerRing from "../components/TimerRing";
import { getSessionsBetween, todayRangeMs } from "../data/studyRepository";
import { formatHoursMinutes } from "../lib/format";
import { useTimerView } from "../timer/useTimerView";
import SubjectList from "./SubjectList";
import "./timerTab.css";

function TimerTab() {
  const {
    activeSubject, isIdle, isWork, isStopwatch, isRunning, clockText, progress, ringColor, phaseLabel,
    cycleCount, subjects, todayBySubject, pause, resume, stopOrSkip,
  } = useTimerView();
  const { settings } = useSettings();

  const [todaySessionCount, setTodaySessionCount] = useState(0);

  // Il recap di oggi si aggiorna ogni volta che todayBySubject cambia
  // (cioè ogni volta che TimerContext registra una nuova sessione).
  useEffect(() => {
    let cancelled = false;
    async function refetchToday() {
      const { start, end } = todayRangeMs();
      const sessions = await getSessionsBetween(start, end);
      if (!cancelled) setTodaySessionCount(sessions.length);
    }
    refetchToday();
    return () => {
      cancelled = true;
    };
  }, [todayBySubject]);

  const studiedTodaySeconds = Object.values(todayBySubject).reduce((sum, s) => sum + s, 0);
  const goalSeconds = settings.studyDailyGoalMinutes * 60;
  const goalProgress = goalSeconds > 0 ? Math.min(1, studiedTodaySeconds / goalSeconds) : 0;
  const topToday = subjects
    .map((s) => ({ subject: s, seconds: todayBySubject[s.id] ?? 0 }))
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)[0];

  // I puntini dei cicli hanno senso solo per un pomodoro in corso.
  const cyclesBeforeLongBreak = Math.max(1, activeSubject?.cyclesBeforeLongBreak ?? 4);
  const completedInSet = cycleCount % cyclesBeforeLongBreak;
  const showDots = !isIdle && !isStopwatch && activeSubject !== null;

  return (
    <>
      <div className="study-detail-recap">
        <div className="study-stat">
          <span className="study-stat-icon study-stat-icon--time">
            <MdOutlineTimer />
          </span>
          <span className="study-stat-value">{formatHoursMinutes(studiedTodaySeconds)}</span>
          <span className="study-stat-label">
            Studiato oggi{goalSeconds > 0 && ` · obiettivo ${formatHoursMinutes(goalSeconds)}`}
          </span>
          {goalSeconds > 0 && (
            <div className="study-goal-track" role="progressbar" aria-valuenow={Math.round(goalProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="study-goal-bar" style={{ width: `${goalProgress * 100}%` }} />
            </div>
          )}
        </div>
        <div className="study-stat">
          <span className="study-stat-icon study-stat-icon--sessions">
            <MdOutlineCheckCircle />
          </span>
          <span className="study-stat-value">{todaySessionCount}</span>
          <span className="study-stat-label">Sessioni oggi</span>
        </div>
        <div className="study-stat">
          <span className="study-stat-icon study-stat-icon--top">
            <MdOutlineStarBorder />
          </span>
          <span className="study-stat-value study-stat-value--text">{topToday ? topToday.subject.name : "—"}</span>
          <span className="study-stat-label">
            {topToday ? `Più studiata oggi · ${formatHoursMinutes(topToday.seconds)}` : "Materia più studiata oggi"}
          </span>
        </div>
      </div>

      <div className="study-detail-main">
        <section className="study-timer-card" style={{ "--timer-glow": ringColor } as CSSProperties}>
          <TimerRing progress={progress} size={168} strokeWidth={10} color={ringColor}>
            <span className="study-timer-clock">{clockText}</span>
            <span className="study-timer-phase">{phaseLabel}</span>
            {activeSubject && (
              <span className="study-timer-subject" style={{ color: ringColor }}>
                {activeSubject.name}
              </span>
            )}
          </TimerRing>

          {showDots && (
            <div className="study-cycle-dots" title={`${completedInSet} di ${cyclesBeforeLongBreak} pomodori prima della pausa lunga`}>
              {Array.from({ length: cyclesBeforeLongBreak }).map((_, i) => (
                <span
                  key={i}
                  className={`study-cycle-dot${i < completedInSet ? " is-filled" : ""}`}
                  style={i < completedInSet ? { background: ringColor } : undefined}
                />
              ))}
            </div>
          )}

          {!isIdle && (
            <div className="study-timer-controls">
              <button type="button" className="study-icon-btn" onClick={isRunning ? pause : resume} aria-label={isRunning ? "Metti in pausa" : "Riprendi"}>
                {isRunning ? <MdPause /> : <MdPlayArrow />}
              </button>
              <button
                type="button"
                className="study-icon-btn study-icon-btn--muted"
                onClick={stopOrSkip}
                aria-label={isWork ? "Ferma" : "Salta pausa"}
                title={isWork ? "Ferma e salva la sessione" : "Salta la pausa"}
              >
                {isWork ? <MdStop /> : <MdSkipNext />}
              </button>
            </div>
          )}

          {isIdle && <p className="study-timer-hint">Scegli una materia qui a fianco per iniziare.</p>}
        </section>

        <SubjectList />
      </div>
    </>
  );
}

export default TimerTab;
