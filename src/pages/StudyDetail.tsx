import { useState, useEffect, type FormEvent } from "react";
import {
  MdPlayArrow,
  MdPause,
  MdStop,
  MdSkipNext,
  MdAdd,
  MdDeleteOutline,
} from "react-icons/md";
import "../css/StudyDetail.css";
import { useTimer } from "../context/TimerContext";
import { useNav } from "../context/NavContext";
import { useSettings } from "../context/SettingContext";
import { getSessionsBetween, todayRangeMs, type StudySession } from "../database/studyRepository";
import { formatClock, formatHoursMinutes } from "../widgets/studyFormat";
import TimerRing from "../components/study/TimerRing";
import BackButton from "../components/layout/BackButton";

const PHASE_LABEL: Record<string, string> = {
  idle: "Pronto per iniziare",
  work: "In studio",
  short_break: "Pausa breve",
  long_break: "Pausa lunga",
};

type DetailTab = "timer" | "settings" | "report";
type ReportPeriod = "week" | "month";

interface Bucket {
  label: string;
  start: number;
  end: number;
  seconds: number;
}

function buildWeekBuckets(): Bucket[] {
  const now = new Date();
  const buckets: Bucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const start = d.getTime();
    buckets.push({
      label: d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", ""),
      start,
      end: start + 24 * 60 * 60 * 1000,
      seconds: 0,
    });
  }
  return buckets;
}

function buildMonthBuckets(): Bucket[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weeks = 5;
  const buckets: Bucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = todayStart - i * 7 * 24 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000;
    const start = end - 7 * 24 * 60 * 60 * 1000;
    buckets.push({ label: i === 0 ? "Questa sett." : `-${i} sett.`, start, end, seconds: 0 });
  }
  return buckets;
}

function fillBuckets(buckets: Bucket[], sessions: StudySession[]): Bucket[] {
  const filled = buckets.map((b) => ({ ...b }));
  for (const session of sessions) {
    const bucket = filled.find((b) => session.endedAt >= b.start && session.endedAt < b.end);
    if (bucket) bucket.seconds += session.durationSeconds;
  }
  return filled;
}

/**
 * Grafico a barre disegnato a mano in SVG: un solo tipo di grafico
 * semplice non giustifica una libreria di charting in più da compilare.
 */
function ReportBarChart({ buckets }: { buckets: Bucket[] }) {
  const chartHeight = 160;
  const barWidth = 34;
  const gap = 22;
  const width = buckets.length * (barWidth + gap) + gap;
  const maxSeconds = Math.max(1, ...buckets.map((b) => b.seconds));

  return (
    <svg
      className="study-report-chart"
      viewBox={`0 0 ${width} ${chartHeight + 24}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Minuti studiati per periodo"
    >
      {buckets.map((b, i) => {
        const h = Math.round((b.seconds / maxSeconds) * chartHeight);
        const x = gap + i * (barWidth + gap);
        const y = chartHeight - h;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(h, 2)}
              rx={6}
              fill="var(--accent)"
              opacity={b.seconds === 0 ? 0.18 : 1}
            />
            <text x={x + barWidth / 2} y={chartHeight + 18} textAnchor="middle" className="study-report-chart-label">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function StudyDetail() {
  const {
    ready,
    phase,
    subjectId,
    displaySeconds,
    phaseTotalSeconds,
    isRunning,
    subjects,
    todayBySubject,
    startWork,
    pause,
    resume,
    stopOrSkip,
    addSubject,
    removeSubject,
  } = useTimer();
  const { goToDashboard } = useNav();
  const { settings, updateSetting } = useSettings();

  const [tab, setTab] = useState<DetailTab>("timer");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [reportSessions, setReportSessions] = useState<StudySession[]>([]);
  const [todaySessionCount, setTodaySessionCount] = useState(0);

  // Il recap di oggi serve nella scheda Timer: si aggiorna ogni volta che
  // todayBySubject cambia (cioè ogni volta che TimerContext registra una
  // nuova sessione), senza bisogno di un meccanismo di eventi dedicato
  // tra i due context.
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

  // Le sessioni del periodo servono solo nella scheda Report: le
  // richiediamo solo quando quella scheda è aperta (o il periodo
  // cambia mentre lo è), invece che sempre in background.
  useEffect(() => {
    if (tab !== "report") return;
    let cancelled = false;
    async function refetchReport() {
      const { start: todayStart } = todayRangeMs();
      const days = period === "week" ? 7 : 35;
      const reportStart = todayStart - (days - 1) * 24 * 60 * 60 * 1000;
      const sessions = await getSessionsBetween(reportStart, Date.now() + 60_000);
      if (!cancelled) setReportSessions(sessions);
    }
    refetchReport();
    return () => {
      cancelled = true;
    };
  }, [tab, period, todayBySubject]);

  if (!ready) {
    return (
      <div className="study-detail">
        <header className="dashboard-header study-detail-header">
          <div>
            <h1>Studio</h1>
          </div>
          <BackButton onClick={goToDashboard} />
        </header>
        <p className="study-detail-loading">Caricamento…</p>
      </div>
    );
  }

  const studiedTodaySeconds = Object.values(todayBySubject).reduce((sum, s) => sum + s, 0);
  const topSubject = subjects
    .map((s) => ({ subject: s, seconds: todayBySubject[s.id] ?? 0 }))
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)[0];

  const activeSubject = subjects.find((s) => s.id === subjectId) ?? null;
  const isBreak = phase === "short_break" || phase === "long_break";
  const isWork = phase === "work";
  const progress = phase === "idle" || phaseTotalSeconds === 0 ? 0 : 1 - displaySeconds / phaseTotalSeconds;
  const ringColor = phase === "idle" ? "var(--text-muted)" : isBreak ? "var(--study-break)" : "var(--accent)";

  const buckets = fillBuckets(period === "week" ? buildWeekBuckets() : buildMonthBuckets(), reportSessions);

  const bySubjectInPeriod = new Map<number, number>();
  for (const session of reportSessions) {
    bySubjectInPeriod.set(session.subjectId, (bySubjectInPeriod.get(session.subjectId) ?? 0) + session.durationSeconds);
  }
  const periodRows = subjects
    .map((s) => ({ subject: s, seconds: bySubjectInPeriod.get(s.id) ?? 0 }))
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  function handleAddSubject(e: FormEvent) {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    addSubject(newSubjectName);
    setNewSubjectName("");
  }

  return (
    <div className="study-detail">
      <header className="dashboard-header study-detail-header">
        <div>
          <h1>Studio</h1>
          <p>Timer pomodoro e tempo di studio per materia.</p>
        </div>
        <BackButton onClick={goToDashboard} />
      </header>

      <div className="study-tabs">
        <button type="button" className={tab === "timer" ? "active" : ""} onClick={() => setTab("timer")}>
          Timer
        </button>
        <button type="button" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          Impostazioni
        </button>
        <button type="button" className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>
          Report
        </button>
      </div>

      {tab === "timer" && (
        <>
          <div className="study-detail-recap">
            <div className="study-stat">
              <span className="study-stat-value">{formatHoursMinutes(studiedTodaySeconds)}</span>
              <span className="study-stat-label">Studiato oggi</span>
            </div>
            <div className="study-stat">
              <span className="study-stat-value">{todaySessionCount}</span>
              <span className="study-stat-label">Sessioni oggi</span>
            </div>
            <div className="study-stat">
              <span className="study-stat-value study-stat-value--text">
                {topSubject ? topSubject.subject.name : "—"}
              </span>
              <span className="study-stat-label">Materia più studiata oggi</span>
            </div>
          </div>

          <div className="study-detail-main">
            <section className="study-timer-card">
              <TimerRing progress={progress} size={168} strokeWidth={10} color={ringColor}>
                <span className="study-timer-clock">
                  {formatClock(phase === "idle" ? phaseTotalSeconds || (settings?.pomodoroWorkMinutes ?? 25) * 60 : displaySeconds)}
                </span>
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

              {phase === "idle" && (
                <p className="study-timer-hint">Scegli una materia qui a fianco per iniziare.</p>
              )}
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
            </section>
          </div>
        </>
      )}

      {tab === "settings" && settings && (
        <section className="study-settings-card">
          <h2 className="study-section-title">Impostazioni timer</h2>
          <p className="study-settings-intro">
            Valgono dal prossimo ciclo in poi: una fase già in corso mantiene la durata con cui è partita.
          </p>

          <div className="study-settings-grid">
            <label>
              Lavoro (min)
              <input
                type="number"
                min={1}
                value={settings.pomodoroWorkMinutes}
                onChange={(e) => updateSetting("pomodoroWorkMinutes", Math.max(1, Number(e.target.value)))}
              />
            </label>
            <label>
              Pausa breve (min)
              <input
                type="number"
                min={1}
                value={settings.pomodoroShortBreakMinutes}
                onChange={(e) => updateSetting("pomodoroShortBreakMinutes", Math.max(1, Number(e.target.value)))}
              />
            </label>
            <label>
              Pausa lunga (min)
              <input
                type="number"
                min={1}
                value={settings.pomodoroLongBreakMinutes}
                onChange={(e) => updateSetting("pomodoroLongBreakMinutes", Math.max(1, Number(e.target.value)))}
              />
            </label>
            <label>
              Cicli prima della pausa lunga
              <input
                type="number"
                min={1}
                value={settings.pomodoroCyclesBeforeLongBreak}
                onChange={(e) =>
                  updateSetting("pomodoroCyclesBeforeLongBreak", Math.max(1, Number(e.target.value)))
                }
              />
            </label>
          </div>
        </section>
      )}

      {tab === "report" && (
        <section className="study-report">
          <div className="study-report-header">
            <h2 className="study-section-title">Report</h2>
            <div className="study-period-toggle">
              <button
                type="button"
                className={period === "week" ? "active" : ""}
                onClick={() => setPeriod("week")}
              >
                Settimana
              </button>
              <button
                type="button"
                className={period === "month" ? "active" : ""}
                onClick={() => setPeriod("month")}
              >
                Mese
              </button>
            </div>
          </div>

          <ReportBarChart buckets={buckets} />

          <div className="study-report-table">
            {periodRows.length === 0 ? (
              <p className="study-empty">Nessuna sessione registrata in questo periodo.</p>
            ) : (
              periodRows.map(({ subject, seconds }) => (
                <div key={subject.id} className="study-report-row">
                  <span>{subject.name}</span>
                  <span>{formatHoursMinutes(seconds)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default StudyDetail;
