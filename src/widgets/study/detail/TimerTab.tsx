import { useEffect, useState, type FormEvent } from "react";
import { MdPlayArrow, MdPause, MdStop, MdSkipNext, MdAdd, MdDeleteOutline } from "react-icons/md";
import { useSettings } from "../../../core/settings/SettingsContext";
import TimerRing from "../TimerRing";
import { useTimer } from "../TimerContext";
import { getSessionsBetween, todayRangeMs } from "../studyRepository";
import { formatClock, formatHoursMinutes } from "../studyFormat";

const PHASE_LABEL: Record<string, string> = {
  idle: "Pronto per iniziare",
  work: "In studio",
  short_break: "Pausa breve",
  long_break: "Pausa lunga",
};

function TimerTab() {
  const {
    phase, subjectId, displaySeconds, phaseTotalSeconds, isRunning, subjects, todayBySubject,
    startWork, pause, resume, stopOrSkip, addSubject, removeSubject,
  } = useTimer();
  const { settings } = useSettings();

  const [newSubjectName, setNewSubjectName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
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
  const topSubject = subjects
    .map((s) => ({ subject: s, seconds: todayBySubject[s.id] ?? 0 }))
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)[0];

  const activeSubject = subjects.find((s) => s.id === subjectId) ?? null;
  const isBreak = phase === "short_break" || phase === "long_break";
  const isWork = phase === "work";
  const progress = phase === "idle" || phaseTotalSeconds === 0 ? 0 : 1 - displaySeconds / phaseTotalSeconds;
  const ringColor = phase === "idle" ? "var(--text-muted)" : isBreak ? "var(--study-break)" : "var(--accent)";
  const clockSeconds = phase === "idle" ? settings.pomodoroWorkMinutes * 60 : displaySeconds;

  async function handleAddSubject(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    const result = await addSubject(newSubjectName);
    if (result === "ok") setNewSubjectName("");
    else if (result === "duplicate") setAddError("Esiste già una materia con questo nome.");
    else if (result === "error") setAddError("Impossibile aggiungere la materia.");
  }

  return (
    <>
      <div className="study-detail-recap">
        <div className="study-stat">
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
          <span className="study-stat-value">{todaySessionCount}</span>
          <span className="study-stat-label">Sessioni oggi</span>
        </div>
        <div className="study-stat">
          <span className="study-stat-value study-stat-value--text">{topSubject ? topSubject.subject.name : "—"}</span>
          <span className="study-stat-label">Materia più studiata oggi</span>
        </div>
      </div>

      <div className="study-detail-main">
        <section className="study-timer-card">
          <TimerRing progress={progress} size={168} strokeWidth={10} color={ringColor}>
            <span className="study-timer-clock">{formatClock(clockSeconds)}</span>
            <span className="study-timer-phase">{PHASE_LABEL[phase]}</span>
            {activeSubject && <span className="study-timer-subject">{activeSubject.name}</span>}
          </TimerRing>

          {phase !== "idle" && (
            <div className="study-timer-controls">
              <button
                type="button"
                className="study-icon-btn"
                onClick={isRunning ? pause : resume}
                aria-label={isRunning ? "Metti in pausa" : "Riprendi"}
              >
                {isRunning ? <MdPause /> : <MdPlayArrow />}
              </button>
              <button
                type="button"
                className="study-icon-btn study-icon-btn--muted"
                onClick={stopOrSkip}
                aria-label={isWork ? "Ferma" : "Salta pausa"}
                title={isWork ? "Ferma la sessione" : "Salta la pausa"}
              >
                {isWork ? <MdStop /> : <MdSkipNext />}
              </button>
            </div>
          )}

          {phase === "idle" && <p className="study-timer-hint">Scegli una materia qui a fianco per iniziare.</p>}
        </section>

        <section className="study-subjects-card">
          <h2 className="study-section-title">Materie</h2>

          <div className="study-subjects-list">
            {subjects.length === 0 && (
              <p className="study-empty">Nessuna materia ancora. Aggiungine una qui sotto per iniziare.</p>
            )}
            {subjects.map((subject) => {
              const isActive = subject.id === subjectId;
              const canStart = phase === "idle";
              return (
                <div key={subject.id} className={`study-subject-row${isActive ? " is-active" : ""}`}>
                  <span className="study-subject-name">{subject.name}</span>
                  <span className="study-subject-time">{formatHoursMinutes(todayBySubject[subject.id] ?? 0)}</span>
                  <button
                    type="button"
                    className="study-icon-btn study-icon-btn--small"
                    disabled={!canStart}
                    onClick={() => startWork(subject.id)}
                    aria-label={`Studia ${subject.name}`}
                    title={canStart ? `Studia ${subject.name}` : "Ferma la sessione in corso per cambiare materia"}
                  >
                    <MdPlayArrow />
                  </button>
                  <button
                    type="button"
                    className="study-icon-btn study-icon-btn--small study-icon-btn--muted"
                    disabled={isActive}
                    onClick={() => removeSubject(subject.id)}
                    aria-label={`Rimuovi ${subject.name}`}
                    title={isActive ? "Non puoi rimuovere la materia in corso di studio" : "Rimuovi materia"}
                  >
                    <MdDeleteOutline />
                  </button>
                </div>
              );
            })}
          </div>

          <form className="study-add-subject" onSubmit={handleAddSubject}>
            <input
              type="text"
              placeholder="Nuova materia…"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
            />
            <button type="submit" className="study-icon-btn" aria-label="Aggiungi materia">
              <MdAdd />
            </button>
          </form>
          {addError && <p className="study-form-error">{addError}</p>}
        </section>
      </div>
    </>
  );
}

export default TimerTab;
