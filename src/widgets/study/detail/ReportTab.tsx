import { useEffect, useState, type CSSProperties } from "react";
import { getSessionsBetween, type StudySession } from "../data/studyRepository";
import { colorForSubject } from "../lib/colors";
import { formatHoursMinutes } from "../lib/format";
import { buildBuckets, periodDays, reportRange, type ReportPeriod } from "../lib/report";
import { useTimer } from "../timer/TimerContext";
import "./reportTab.css";

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  week: "ultimi 7 giorni",
  month: "ultime 5 settimane",
};

function ReportTab() {
  const { subjects, todayBySubject } = useTimer();
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [sessions, setSessions] = useState<StudySession[]>([]);

  // La scheda è montata solo quando è aperta: le sessioni si caricano solo
  // allora (e si ricaricano se cambia il periodo o si registra una sessione).
  useEffect(() => {
    let cancelled = false;
    async function refetch() {
      const { start, end } = reportRange(period);
      const loaded = await getSessionsBetween(start, end);
      if (!cancelled) setSessions(loaded);
    }
    refetch();
    return () => {
      cancelled = true;
    };
  }, [period, todayBySubject]);

  const subjectIndex = (id: number) => subjects.findIndex((s) => s.id === id);
  const colorOf = (id: number) => {
    const i = subjectIndex(id);
    return colorForSubject(i >= 0 ? subjects[i] : null, i);
  };

  const buckets = buildBuckets(period, sessions);
  const maxBucketSeconds = Math.max(1, ...buckets.map((b) => b.seconds));
  const totalSeconds = buckets.reduce((sum, b) => sum + b.seconds, 0);

  const bySubject = new Map<number, number>();
  for (const session of sessions) {
    bySubject.set(session.subjectId, (bySubject.get(session.subjectId) ?? 0) + session.durationSeconds);
  }
  const rows = subjects
    .map((s) => ({ subject: s, color: colorOf(s.id), seconds: bySubject.get(s.id) ?? 0 }))
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
  const top = rows[0];

  return (
    <section className="study-report">
      <div className="study-report-header">
        <h2 className="study-section-title">Report · {PERIOD_LABEL[period]}</h2>
        <div className="study-period-toggle">
          <button type="button" className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>
            Settimana
          </button>
          <button type="button" className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>
            Mese
          </button>
        </div>
      </div>

      <div className="study-report-summary">
        <div className="study-stat">
          <span className="study-stat-title">Totale studiato</span>
          <span className="study-stat-value">{formatHoursMinutes(totalSeconds)}</span>
        </div>

        <div className="study-stat study-stat--top" style={top ? ({ "--top-color": top.color } as CSSProperties) : undefined}>
          <span className="study-stat-title">Materia più studiata</span>
          <span className="study-stat-value study-stat-value--text">{top ? top.subject.name : "—"}</span>
          {top && <span className="study-stat-sub">{formatHoursMinutes(top.seconds)}</span>}
        </div>

        <div className="study-stat">
          <span className="study-stat-title">Media al giorno</span>
          <span className="study-stat-value">{formatHoursMinutes(totalSeconds / periodDays(period))}</span>
        </div>
      </div>

      <div className="study-bars" role="img" aria-label="Tempo studiato per periodo, diviso per materia">
        {buckets.map((b) => (
          <div key={b.start} className={`study-bar-col${b.isCurrent ? " is-current" : ""}`}>
            <span className="study-bar-value">{b.seconds > 0 ? formatHoursMinutes(b.seconds) : ""}</span>
            <div className="study-bar-track">
              <div className="study-bar-stack" style={{ height: `${(b.seconds / maxBucketSeconds) * 100}%` }}>
                {Object.entries(b.bySubject)
                  .sort((a, c) => c[1] - a[1])
                  .map(([id, seconds]) => (
                    <div
                      key={id}
                      className="study-bar-seg"
                      style={{ flexGrow: seconds, background: colorOf(Number(id)) }}
                      title={`${subjects.find((s) => s.id === Number(id))?.name ?? ""}: ${formatHoursMinutes(seconds)}`}
                    />
                  ))}
              </div>
            </div>
            <span className="study-bar-label">{b.label}</span>
          </div>
        ))}
      </div>

      <div className="study-report-table">
        {rows.length === 0 ? (
          <p className="study-empty">Nessuna sessione registrata in questo periodo.</p>
        ) : (
          rows.map(({ subject, color, seconds }) => {
            const share = totalSeconds > 0 ? seconds / totalSeconds : 0;
            return (
              <div key={subject.id} className="study-report-row">
                <span className="study-report-row-name">
                  <span className="study-subject-dot" style={{ background: color }} />
                  {subject.name}
                </span>
                <span className="study-report-row-bar">
                  <span style={{ width: `${Math.max(2, share * 100)}%`, background: color }} />
                </span>
                <span className="study-report-row-time">{formatHoursMinutes(seconds)}</span>
                <span className="study-report-row-share">{Math.round(share * 100)}%</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default ReportTab;
