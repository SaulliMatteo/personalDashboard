import { useState } from "react";
import { formatStudyTime, type LeaderboardPeriod } from "../modules/study/leaderboard";
import { monthCoverage } from "../modules/study/totals/aggregate";
import { useStudyTotals } from "../modules/study/totals/useStudyTotals";
import { useLeaderboard } from "../modules/study/useLeaderboard";
import "./GroupRankingTab.css";

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "today", label: "Oggi" },
  { id: "week", label: "Settimana" },
  { id: "month", label: "Mese" },
];

/** "AAAA-MM-GG" → "12 ottobre". */
function dayText(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Scheda "Classifica": oggi, settimana o mese, con le barre. Il mese viene dai totali giornalieri già inviati: chi
 * usa i Gruppi da poco ha solo i giorni da quando ha iniziato ("dal …"), chi non ha mai inviato niente "nessun dato"
 * (mai uno zero finto).
 */
function GroupRankingTab({ groupId }: { groupId: string }) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const rows = useLeaderboard(groupId, period);
  const totals = useStudyTotals();
  const max = Math.max(1, ...rows.map((r) => r.seconds));

  const coverage = (userId: string) => (period === "month" ? monthCoverage(totals.firstDay[userId], totals.monthStart) : null);
  const anyPartial = rows.some((r) => {
    const cov = coverage(r.userId);
    return cov !== null && cov.kind !== "full";
  });

  return (
    <div className="gr">
      <div className="gr-periods" role="group" aria-label="Periodo">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={period === p.id ? "is-on" : undefined}
            aria-pressed={period === p.id}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <ol className="gr-rows">
        {rows.map((r) => {
          const cov = coverage(r.userId);
          const noData = cov?.kind === "none" && r.seconds === 0;
          const time = noData ? "nessun dato" : formatStudyTime(r.seconds);
          return (
            <li key={r.userId} className={`gr-row${r.isMe ? " is-me" : ""}`}>
              <span className={`gr-rank${r.rank === 1 ? " is-first" : ""}`}>{r.rank}</span>
              <span className="gr-name">
                <span className="gr-name-text">
                  {r.username}
                  {r.isMe ? " (tu)" : ""}
                </span>
                {cov?.kind === "partial" && <span className="gr-since">dal {dayText(cov.from)}</span>}
              </span>
              <span className="gr-bar" aria-hidden="true">
                <span style={{ width: `${Math.round((r.seconds / max) * 100)}%` }} />
              </span>
              <span className={`gr-time${noData ? " is-empty" : ""}`}>{time}</span>
            </li>
          );
        })}
      </ol>

      {anyPartial && (
        <p className="gr-note">
          Il mese conta dal giorno in cui ognuno ha iniziato a usare i Gruppi: per chi è arrivato da poco è parziale ("dal
          …"), chi non ha ancora inviato niente non ha dati.
        </p>
      )}
      {totals.stale && totals.loadedAt !== null && (
        <p className="gr-note">Il server non risponde: i tempi degli altri sono quelli delle {timeOf(totals.loadedAt)}.</p>
      )}
    </div>
  );
}

export default GroupRankingTab;
