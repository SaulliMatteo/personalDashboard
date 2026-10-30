import { useCallback, useEffect, useState } from "react";
import { fetchGroupSubjectReport, fetchGroupSubjects, type GroupSubject, type GroupSubjectReport } from "../../core/cloud/groupSubjectsApi";
import type { CloudGroup } from "../../core/cloud/groupsApi";
import { buildBuckets, periodRange, type ReportPeriod, type TimedItem } from "../../core/report/periods";
import { messageOf } from "../groups/messages";
import { useGroups } from "../groups/useGroups";
import { formatStudyTime } from "../modules/study/leaderboard";
import { dayKey } from "../modules/study/sync/plan";
import GroupSubjectLinks from "./GroupSubjectLinks";
import GroupSubjectsManage from "./GroupSubjectsManage";
import { subjectColor } from "./subjectColor";
import "./GroupReportTab.css";

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "week", label: "Settimana" },
  { id: "month", label: "Mese" },
  { id: "year", label: "Anno" },
];

/** Nel grafico "Altre materie" ha l'id -1 (le materie del gruppo vanno da 0). */
const OTHER = -1;

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

/** "AAAA-MM-GG" → mezzogiorno di quel giorno locale (dentro il giorno anche con il cambio d'ora). */
function noonOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

function dayText(day: string): string {
  return new Date(noonOf(day)).toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

interface Loaded {
  key: string;
  report: GroupSubjectReport;
}

/**
 * Scheda "Report": come il report di Studio (Settimana / Mese / Anno con le frecce, barre impilate per materia,
 * legenda con i totali) ma sommato su tutti i membri e con le materie del gruppo. Sotto, l'abbinamento delle proprie
 * materie e, per il proprietario, la gestione delle materie del gruppo.
 */
function GroupReportTab({ group, isOwner, onOpenSharing }: { group: CloudGroup; isOwner: boolean; onOpenSharing: () => void }) {
  const { members } = useGroups();
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [offset, setOffset] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [subjects, setSubjects] = useState<GroupSubject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const range = periodRange(period, offset);
  const fromDay = dayKey(new Date(range.start));
  const toDay = dayKey(new Date(range.end - 1));
  const key = `${group.id}:${fromDay}:${toDay}:${version}`;

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchGroupSubjectReport(group.id, fromDay, toDay), fetchGroupSubjects([group.id])])
      .then(([report, list]) => {
        if (cancelled) return;
        setLoaded({ key, report });
        setSubjects(list);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(messageOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, [group.id, fromDay, toDay, key]);

  const report = loaded?.report ?? null;
  const active = subjects.filter((s) => s.mergedInto === null);
  const indexOf = new Map(active.map((s, i) => [s.id, i] as const));
  const usernames = new Map((members[group.id] ?? []).map((m) => [m.userId, m.username] as const));

  // ogni giorno del server diventa un intervallo a mezzogiorno: buildBuckets lo mette nella barra giusta
  const items: TimedItem[] = [];
  for (const row of report?.subjects ?? []) {
    const index = indexOf.get(row.subjectId);
    if (index !== undefined) items.push({ endedAt: noonOf(row.day), durationSeconds: row.seconds, groupId: index });
  }
  for (const row of report?.other ?? []) items.push({ endedAt: noonOf(row.day), durationSeconds: row.seconds, groupId: OTHER });
  const buckets = buildBuckets(period, range, items);
  const max = Math.max(1, ...buckets.map((b) => b.seconds));
  const total = buckets.reduce((sum, b) => sum + b.seconds, 0);

  const legend = [
    ...active.map((s, i) => ({
      id: i,
      name: s.name,
      color: subjectColor(s.color),
      who: (report?.contributors.get(s.id) ?? []).map((u) => usernames.get(u) ?? "ex membro").join(", "),
      seconds: items.filter((it) => it.groupId === i).reduce((sum, it) => sum + it.durationSeconds, 0),
    })),
    {
      id: OTHER,
      name: "Altre materie",
      color: "var(--group-subject-other)",
      who: "non abbinate o non condivise",
      seconds: items.filter((it) => it.groupId === OTHER).reduce((sum, it) => sum + it.durationSeconds, 0),
    },
  ]
    .filter((s) => s.seconds > 0 || s.id === OTHER)
    .sort((a, b) => (a.id === OTHER ? 1 : b.id === OTHER ? -1 : b.seconds - a.seconds));
  const colorOf = (id: number) => legend.find((s) => s.id === id)?.color ?? "var(--group-subject-other)";
  const nameOf = (id: number) => legend.find((s) => s.id === id)?.name ?? "";

  const firstDay = report?.firstDay ?? null;
  const canGoBack = firstDay !== null && noonOf(firstDay) < range.start;
  const partial = firstDay !== null && noonOf(firstDay) > range.start && noonOf(firstDay) < range.end;

  const chartLabel =
    `Tempo di studio del gruppo, ${range.title}, totale ${formatStudyTime(total)}: ` +
    legend
      .filter((s) => s.seconds > 0)
      .map((s) => `${s.name} ${formatStudyTime(s.seconds)}`)
      .join(", ");

  return (
    <div className="grr">
      <div className="grr-head">
        <div className="grr-periods" role="group" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={period === p.id ? "is-on" : undefined}
              aria-pressed={period === p.id}
              onClick={() => {
                setPeriod(p.id);
                setOffset(0);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grr-nav">
          <button
            type="button"
            className="grr-arrow"
            aria-label="Periodo precedente"
            disabled={!canGoBack}
            onClick={() => setOffset((o) => o - 1)}
          >
            <ChevronIcon dir="left" />
          </button>
          <span className="grr-range">{range.title}</span>
          <button
            type="button"
            className="grr-arrow"
            aria-label="Periodo successivo"
            disabled={offset >= 0}
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
      </div>

      {error && (
        <p className="grp-error" role="alert">
          {error}
        </p>
      )}

      <div className="grr-body">
        <div className="grr-chart">
          <div className="grr-chart-head">
            <span>Tempo del gruppo per {period === "week" ? "giorno" : period === "month" ? "settimana" : "mese"}</span>
            <span>{formatStudyTime(total)}</span>
          </div>
          <div className={`grr-bars grr-bars--${period}`} role="img" aria-label={chartLabel}>
            {buckets.map((b) => (
              <div key={b.start} className="grr-col" title={`${b.title}: ${b.seconds > 0 ? formatStudyTime(b.seconds) : "nessuno studio"}`}>
                <div className="grr-track">
                <div className="grr-stack" style={{ height: `${(b.seconds / max) * 100}%` }}>
                  {Object.entries(b.byGroup)
                    .filter(([, s]) => s > 0)
                    .sort((x, y) => (Number(x[0]) === OTHER ? -1 : Number(y[0]) === OTHER ? 1 : y[1] - x[1]))
                    .map(([id, seconds]) => (
                      <span
                        key={id}
                        className="grr-seg"
                        style={{ flexGrow: seconds, background: colorOf(Number(id)) }}
                        title={`${nameOf(Number(id))}: ${formatStudyTime(seconds)}`}
                      />
                    ))}
                </div>
                </div>
                <span className={`grr-label${b.isCurrent ? " is-current" : ""}`}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        <ul className="grr-legend">
          {legend.map((s) => (
            <li key={s.id} className="grr-legend-row">
              <span className="grr-swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="grr-legend-text">
                <span className="grr-legend-name">{s.name}</span>
                {s.who && <span className="grr-legend-who">{s.who}</span>}
              </span>
              <span className="grr-legend-time">{formatStudyTime(s.seconds)}</span>
            </li>
          ))}
        </ul>
      </div>

      {partial && firstDay && (
        <p className="grp-note">
          Ci sono dati dal {dayText(firstDay)}: prima nessuno del gruppo li aveva ancora inviati, quindi questo periodo è
          parziale.
        </p>
      )}

      <GroupSubjectLinks group={group} subjects={subjects} onChanged={reload} onOpenSharing={onOpenSharing} />
      {isOwner && <GroupSubjectsManage subjects={active} onChanged={reload} />}
    </div>
  );
}

export default GroupReportTab;
