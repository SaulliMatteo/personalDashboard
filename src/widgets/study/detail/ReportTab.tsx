import { useEffect, useState, type CSSProperties } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import {
  getFirstSessionTime,
  getSessionsBetween,
  listAllSubjects,
  type StudySession,
  type Subject,
} from "../data/studyRepository";
import { colorForSubject } from "../lib/colors";
import { formatHoursMinutes } from "../lib/format";
import { buildBuckets, periodRange, type ReportPeriod } from "../lib/report";
import { useTimer } from "../timer/useTimer";
import "./reportTab.css";

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "week", label: "Settimana" },
  { id: "month", label: "Mese" },
  { id: "year", label: "Anno" },
];

/** Colore per sessioni di una materia che non esiste più (non dovrebbe capitare: serve a far quadrare comunque i totali). */
const UNKNOWN_COLOR = "var(--text-muted)";

function ReportTab() {
  // `subjects` = solo le materie ATTIVE (come nel timer): servono per mantenere i colori
  // uguali a quelli del timer. Nomi e colori delle ARCHIVIATE si leggono da `allSubjects`.
  const { subjects, todayBySubject } = useTimer();
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [offset, setOffset] = useState(0); // 0 = periodo in corso, -1 = il precedente…
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [firstSession, setFirstSession] = useState<number | null>(null);

  const range = periodRange(period, offset);

  // La scheda è montata solo quando è aperta: i dati si caricano solo allora (e si
  // ricaricano se cambia il periodo, si registra una sessione o si archivia una materia).
  useEffect(() => {
    let cancelled = false;
    async function refetch() {
      try {
        const [loadedSessions, loadedSubjects, first] = await Promise.all([
          getSessionsBetween(range.start, range.end),
          listAllSubjects(),
          getFirstSessionTime(),
        ]);
        if (cancelled) return;
        setSessions(loadedSessions);
        setAllSubjects(loadedSubjects);
        setFirstSession(first);
      } catch (error) {
        console.error("Errore nel caricamento del report:", error);
      }
    }
    void refetch();
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, todayBySubject, subjects]);

  function changePeriod(next: ReportPeriod) {
    setPeriod(next);
    setOffset(0);
  }

  // Si può tornare indietro solo se esistono sessioni prima dell'inizio del periodo mostrato.
  const canGoBack = firstSession !== null && firstSession < range.start;
  const canGoForward = offset < 0;

  const subjectById = new Map(allSubjects.map((s) => [s.id, s] as const));
  const nameOf = (id: number) => subjectById.get(id)?.name ?? "Materia eliminata";
  const colorOf = (id: number) => {
    const activeIndex = subjects.findIndex((s) => s.id === id);
    if (activeIndex >= 0) return colorForSubject(subjects[activeIndex], activeIndex);
    const archived = subjectById.get(id);
    return archived ? colorForSubject(archived, 0) : UNKNOWN_COLOR;
  };

  const buckets = buildBuckets(period, range, sessions);
  const maxBucketSeconds = Math.max(1, ...buckets.map((b) => b.seconds));
  const totalSeconds = buckets.reduce((sum, b) => sum + b.seconds, 0);

  // Le righe vengono dalle sessioni, non dall'elenco materie: così anche le archiviate compaiono.
  const bySubject = new Map<number, number>();
  for (const session of sessions) {
    bySubject.set(session.subjectId, (bySubject.get(session.subjectId) ?? 0) + session.durationSeconds);
  }
  const rows = [...bySubject.entries()]
    .map(([id, seconds]) => ({
      id,
      name: nameOf(id),
      color: colorOf(id),
      seconds,
      archived: subjectById.get(id)?.archivedAt != null,
    }))
    .sort((a, b) => b.seconds - a.seconds);
  const top = rows[0];

  return (
    <section className="study-report">
      <div className="study-report-header">
        <div className="study-report-nav">
          <button
            type="button"
            className="study-nav-btn"
            onClick={() => setOffset((o) => o - 1)}
            disabled={!canGoBack}
            aria-label="Periodo precedente"
            title={canGoBack ? "Periodo precedente" : "Non ci sono sessioni prima di questo periodo"}
          >
            <MdChevronLeft />
          </button>
          <h2 className="study-report-title">{range.title}</h2>
          <button
            type="button"
            className="study-nav-btn"
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={!canGoForward}
            aria-label="Periodo successivo"
          >
            <MdChevronRight />
          </button>
          {offset !== 0 && (
            <button type="button" className="study-nav-today" onClick={() => setOffset(0)}>
              Oggi
            </button>
          )}
        </div>

        <div className="study-period-toggle">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className={period === p.id ? "active" : ""} onClick={() => changePeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="study-report-summary">
        <div className="study-stat">
          <span className="study-stat-title">Totale studiato</span>
          <span className="study-stat-value">{formatHoursMinutes(totalSeconds)}</span>
        </div>

        <div className="study-stat study-stat--top" style={top ? ({ "--top-color": top.color } as CSSProperties) : undefined}>
          <span className="study-stat-title">Materia più studiata</span>
          <span className="study-stat-value study-stat-value--text">{top ? top.name : "—"}</span>
          {top && <span className="study-stat-sub">{formatHoursMinutes(top.seconds)}</span>}
        </div>

        <div className="study-stat">
          <span className="study-stat-title">Media al giorno</span>
          <span className="study-stat-value">{formatHoursMinutes(totalSeconds / range.elapsedDays)}</span>
        </div>
      </div>

      <div
        className={`study-bars study-bars--${period}`}
        role="img"
        aria-label="Tempo studiato per periodo, diviso per materia"
      >
        {buckets.map((b) => (
          <div
            key={b.start}
            className={`study-bar-col${b.isCurrent ? " is-current" : ""}`}
            title={`${b.title}: ${b.seconds > 0 ? formatHoursMinutes(b.seconds) : "nessuno studio"}`}
          >
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
                      title={`${nameOf(Number(id))}: ${formatHoursMinutes(seconds)}`}
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
          rows.map(({ id, name, color, seconds, archived }) => {
            const share = totalSeconds > 0 ? seconds / totalSeconds : 0;
            return (
              <div key={id} className="study-report-row">
                <span className="study-report-row-name">
                  <span className="study-subject-dot" style={{ background: color }} />
                  {name}
                  {archived && <span className="study-archived-tag">archiviata</span>}
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
