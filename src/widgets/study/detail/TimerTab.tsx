import { createElement, useEffect, useState } from "react";
import { useSettings } from "../../../core/settings/SettingsContext";
import { useThemeVariant } from "../../../core/theme/variants";
import ProgressBar from "../../../ui/ProgressBar";
import { STUDY_CARDS } from "../card/cards";
import { getSessionsBetween, todayRangeMs } from "../data/studyRepository";
import { formatHoursMinutes } from "../lib/format";
import { useTimerView } from "../timer/useTimerView";
import SubjectList from "./SubjectList";
import "./timerTab.css";

function TimerTab() {
  const { subjects, todayBySubject } = useTimerView();
  const { settings } = useSettings();
  const Card = useThemeVariant(STUDY_CARDS);

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

  return (
    <>
      <div className="study-detail-recap">
        <div className="study-stat">
          <span className="study-stat-title">Studiato oggi</span>
          <span className="study-stat-value">{formatHoursMinutes(studiedTodaySeconds)}</span>
          {goalSeconds > 0 && (
            <>
              <span className="study-stat-sub">Obiettivo {formatHoursMinutes(goalSeconds)}</span>
              <ProgressBar value={goalProgress} className="study-goal-bar" label="Avanzamento dell'obiettivo di oggi" />
            </>
          )}
        </div>
        <div className="study-stat">
          <span className="study-stat-title">Sessioni oggi</span>
          <span className="study-stat-value">{todaySessionCount}</span>
        </div>
        <div className="study-stat">
          <span className="study-stat-title">Più studiata oggi</span>
          <span className="study-stat-value study-stat-value--text">{topToday ? topToday.subject.name : "—"}</span>
          {topToday && <span className="study-stat-sub">{formatHoursMinutes(topToday.seconds)}</span>}
        </div>
      </div>

      <div className="study-detail-main">
        {/* Il timer è la card 2×2 del tema: stesso quadrante e stessi pulsanti della dashboard. */}
        <section className="study-timer-card">{createElement(Card, { size: "M" })}</section>

        <SubjectList />
      </div>
    </>
  );
}

export default TimerTab;
