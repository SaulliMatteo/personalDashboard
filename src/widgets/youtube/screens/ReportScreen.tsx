import { useEffect, useMemo, useState } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { buildBuckets, periodRange, type ReportPeriod } from "../../../core/report/periods";
import {
  getFirstWatchTime,
  getNotesBetween,
  getWatchSessionsBetween,
  type NoteInPeriod,
  type SavedVideo,
  type VideoFolder,
  type WatchSession,
} from "../data/youtubeRepository";
import { formatWatchTime } from "../lib/library";
import { buildVideoReport, niceScale, sessionGroupId } from "../lib/videoReport";

interface ReportScreenProps {
  folders: VideoFolder[];
  videos: SavedVideo[];
}

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "week", label: "Settimana" },
  { id: "month", label: "Mese" },
  { id: "year", label: "Anno" },
];

const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

/** Quanto, cosa e dove hai guardato: stessa navigazione per periodi del report di Studio. */
function ReportScreen({ folders, videos }: ReportScreenProps) {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [offset, setOffset] = useState(0);
  const [sessions, setSessions] = useState<WatchSession[]>([]);
  const [previousSeconds, setPreviousSeconds] = useState(0);
  const [notes, setNotes] = useState<NoteInPeriod[]>([]);
  const [firstWatch, setFirstWatch] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = periodRange(period, offset);
  const previous = periodRange(period, offset - 1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getWatchSessionsBetween(range.start, range.end),
      getWatchSessionsBetween(previous.start, previous.end),
      getNotesBetween(range.start, range.end),
      getFirstWatchTime(),
    ])
      .then(([current, before, noteRows, first]) => {
        if (cancelled) return;
        setSessions(current);
        setPreviousSeconds(before.reduce((sum, s) => sum + s.durationSeconds, 0));
        setNotes(noteRows);
        setFirstWatch(first);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
    // range/previous derivano da period+offset: bastano loro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, offset, videos]);

  const report = useMemo(
    () => buildVideoReport({ sessions, notes, folders, videos, previousSeconds, range }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, notes, folders, videos, previousSeconds, period, offset]
  );
  const buckets = useMemo(
    () =>
      buildBuckets(
        period,
        range,
        sessions.map((s) => ({ endedAt: s.endedAt, durationSeconds: s.durationSeconds, groupId: sessionGroupId(folders, s) }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, folders, period, offset]
  );
  const scale = niceScale(Math.max(0, ...buckets.map((b) => b.seconds)));
  const groupById = new Map(report.groups.map((g) => [g.groupId, g]));

  const canGoBack = firstWatch !== null && firstWatch < range.start;
  const canGoForward = offset < 0;
  const empty = report.totalSeconds === 0 && report.notesCount === 0;

  function changePeriod(next: ReportPeriod) {
    setPeriod(next);
    setOffset(0);
  }

  const delta = report.deltaPercent;

  return (
    <div className="yt-report">
      <div className="yt-screen-head">
        <div className="yt-report-nav">
          <button type="button" className="yt-nav-btn" onClick={() => setOffset((o) => o - 1)} disabled={!canGoBack} aria-label="Periodo precedente" title={canGoBack ? "Periodo precedente" : "Non c'è nulla prima di questo periodo"}>
            <MdChevronLeft />
          </button>
          <h2 className="yt-report-title">{range.title}</h2>
          <button type="button" className="yt-nav-btn" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={!canGoForward} aria-label="Periodo successivo">
            <MdChevronRight />
          </button>
          {offset !== 0 && (
            <button type="button" className="yt-today-btn" onClick={() => setOffset(0)}>
              Oggi
            </button>
          )}
        </div>
        <div className="yt-toggle">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className={period === p.id ? "active" : ""} onClick={() => changePeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="yt-banner yt-banner--error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="yt-stats">
        <div className="yt-card yt-stat">
          <span className="yt-label">TEMPO DI VISIONE</span>
          <span className="yt-stat-value">{formatWatchTime(report.totalSeconds)}</span>
          <span
            className={`yt-stat-sub${delta === null ? "" : delta >= 0 ? " is-up" : " is-down"}`}
            title={offset === 0 ? "Il periodo in corso non è ancora finito: il confronto è con il periodo precedente intero." : undefined}
          >
            {delta === null ? "nessun confronto" : `${delta > 0 ? "+" : ""}${delta}% rispetto al periodo precedente`}
          </span>
        </div>
        <div className="yt-card yt-stat">
          <span className="yt-label">VIDEO GUARDATI</span>
          <span className="yt-stat-value">{report.videosWatched}</span>
          <span className="yt-stat-sub">con tempo di visione</span>
        </div>
        <div className="yt-card yt-stat">
          <span className="yt-label">MEDIA GIORNALIERA</span>
          <span className="yt-stat-value">{formatWatchTime(report.avgPerDaySeconds)}</span>
          <span className="yt-stat-sub">su {range.elapsedDays} {range.elapsedDays === 1 ? "giorno" : "giorni"}</span>
        </div>
        <div className="yt-card yt-stat">
          <span className="yt-label">APPUNTI RACCOLTI</span>
          <span className="yt-stat-value">{report.notesCount}</span>
          <span className="yt-stat-sub">scritti nel periodo</span>
        </div>
      </div>

      {empty ? (
        <section className="yt-card yt-report-empty">
          <p className="yt-muted">Nessuna visione né appunto in questo periodo.</p>
        </section>
      ) : (
        <>
          <section className="yt-card yt-chart-card">
            <div className="yt-section-title">
              <h3>Il tuo ritmo</h3>
              <span className="yt-muted">tempo di visione per {period === "week" ? "giorno" : period === "month" ? "settimana" : "mese"}</span>
            </div>
            <div className="yt-chart">
              <div className="yt-chart-axis" aria-hidden>
                {[...scale.ticks].reverse().map((t) => (
                  <span key={t}>{t === 0 ? "0" : formatWatchTime(t)}</span>
                ))}
              </div>
              <div className={`yt-bars yt-bars--${period}`} role="img" aria-label="Tempo di visione per periodo, diviso per cartella">
                {buckets.map((b) => (
                  <div key={b.start} className={`yt-bar-col${b.isCurrent ? " is-current" : ""}`} title={`${b.title}: ${b.seconds > 0 ? formatWatchTime(b.seconds) : "nessuna visione"}`}>
                    <div className="yt-bar-track">
                      <div className="yt-bar-stack" style={{ height: `${(b.seconds / scale.max) * 100}%` }}>
                        {Object.entries(b.byGroup)
                          .sort((a, c) => c[1] - a[1])
                          .map(([id, seconds]) => (
                            <div key={id} className="yt-bar-seg" style={{ flexGrow: seconds, background: groupById.get(Number(id))?.color ?? "var(--text-muted)" }} title={`${groupById.get(Number(id))?.name ?? ""}: ${formatWatchTime(seconds)}`} />
                          ))}
                      </div>
                    </div>
                    <span className="yt-bar-label">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="yt-card">
            <div className="yt-section-title">
              <h3>Dove va la tua curiosità</h3>
              <span className="yt-muted">quota di tempo per cartella di primo livello</span>
            </div>
            {report.totalSeconds === 0 ? (
              <p className="yt-muted">Nessun tempo di visione in questo periodo.</p>
            ) : (
              <>
                <div className="yt-share-bar">
                  {report.groups
                    .filter((g) => g.seconds > 0)
                    .map((g) => (
                      <span key={g.groupId} style={{ flexGrow: g.seconds, background: g.color }} title={`${g.name}: ${formatWatchTime(g.seconds)}`} />
                    ))}
                </div>
                <ul className="yt-share-legend">
                  {report.groups
                    .filter((g) => g.seconds > 0)
                    .map((g) => (
                      <li key={g.groupId}>
                        <span className="yt-dot" style={{ background: g.color }} />
                        <span className="yt-share-name">{g.name}</span>
                        <span className="yt-muted">{Math.round((g.seconds / report.totalSeconds) * 100)}%</span>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </section>

          <section className="yt-card yt-table-card">
            <div className="yt-section-title">
              <h3>Per cartella</h3>
            </div>
            <div className="yt-table-scroll">
              <table className="yt-table">
                <thead>
                  <tr>
                    <th>Cartella</th>
                    <th title="Video distinti con tempo di visione nel periodo">Video guardati</th>
                    <th>Tempo di visione</th>
                    <th title="Lunghezza media dei video (quelli con durata nota)">Durata media</th>
                    <th title="Avanzamento medio dei video ancora presenti">Completamento</th>
                    <th>Appunti</th>
                  </tr>
                </thead>
                <tbody>
                  {report.groups.map((g) => (
                    <tr key={g.groupId}>
                      <td>
                        <span className="yt-dot" style={{ background: g.color }} />
                        {g.name}
                      </td>
                      <td>{g.videos}</td>
                      <td>{formatWatchTime(g.seconds)}</td>
                      <td>{g.avgDurationSeconds === null ? "—" : formatWatchTime(g.avgDurationSeconds)}</td>
                      <td>{percent(g.completion)}</td>
                      <td>{g.notes}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Totale</td>
                    <td>{report.total.videos}</td>
                    <td>{formatWatchTime(report.total.seconds)}</td>
                    <td>{report.total.avgDurationSeconds === null ? "—" : formatWatchTime(report.total.avgDurationSeconds)}</td>
                    <td>{percent(report.total.completion)}</td>
                    <td>{report.total.notes}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default ReportScreen;
