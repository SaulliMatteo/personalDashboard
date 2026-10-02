import { useEffect, useState } from "react";
import { getSessionsBetween, todayRangeMs, type StudySession } from "../studyRepository";
import { useTimer } from "../TimerContext";
import { formatHoursMinutes } from "../studyFormat";
import ReportBarChart from "./ReportBarChart";
import { buildBuckets, periodDays, type ReportPeriod } from "./report";

const DAY_MS = 24 * 60 * 60 * 1000;

function ReportTab() {
  const { subjects, todayBySubject } = useTimer();
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [sessions, setSessions] = useState<StudySession[]>([]);

  // La scheda è montata solo quando è aperta: le sessioni si caricano
  // solo allora (e si ricaricano se cambia il periodo o si registra una sessione).
  useEffect(() => {
    let cancelled = false;
    async function refetch() {
      const { start: todayStart } = todayRangeMs();
      const reportStart = todayStart - (periodDays(period) - 1) * DAY_MS;
      const loaded = await getSessionsBetween(reportStart, Date.now() + 60_000);
      if (!cancelled) setSessions(loaded);
    }
    refetch();
    return () => {
      cancelled = true;
    };
  }, [period, todayBySubject]);

  const buckets = buildBuckets(period, sessions);

  const bySubject = new Map<number, number>();
  for (const session of sessions) {
    bySubject.set(session.subjectId, (bySubject.get(session.subjectId) ?? 0) + session.durationSeconds);
  }
  const rows = subjects
    .map((s) => ({ subject: s, seconds: bySubject.get(s.id) ?? 0 }))
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  return (
    <section className="study-report">
      <div className="study-report-header">
        <h2 className="study-section-title">Report</h2>
        <div className="study-period-toggle">
          <button type="button" className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>
            Settimana
          </button>
          <button type="button" className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>
            Mese
          </button>
        </div>
      </div>

      <ReportBarChart buckets={buckets} />

      <div className="study-report-table">
        {rows.length === 0 ? (
          <p className="study-empty">Nessuna sessione registrata in questo periodo.</p>
        ) : (
          rows.map(({ subject, seconds }) => (
            <div key={subject.id} className="study-report-row">
              <span>{subject.name}</span>
              <span>{formatHoursMinutes(seconds)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default ReportTab;
