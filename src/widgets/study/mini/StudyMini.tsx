import { useActivityStatus } from "../../../core/activity/activityBus";
import { useNow } from "../../../core/hooks/useNow";
import "./StudyMini.css";

/** Linea della giornata: dalle 7 a mezzanotte, come nel mockup di Notte (etichette 8, 12, 16, 20, 24). */
const DAY_START_H = 7;
const DAY_HOURS = 17;
const HOUR_LABELS = [8, 12, 16, 20, 24];

function dayPercent(ms: number, midnight: number): number {
  const hours = (ms - midnight) / 3_600_000;
  return Math.max(0, Math.min(100, ((hours - DAY_START_H) / DAY_HOURS) * 100));
}

/** Mini da intestazione: "La tua giornata", le sessioni di studio di oggi su una linea delle ore. */
function StudyMini() {
  const { studyTodaySpans: spans } = useActivityStatus();
  const now = useNow();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const count = spans.length;
  return (
    <div className="study-mini">
      <div className="study-mini-head">
        <span>La tua giornata</span>
        <span>{count === 1 ? "1 sessione" : `${count} sessioni`}</span>
      </div>
      <div className="study-mini-track" role="img" aria-label={`Sessioni di studio di oggi: ${count}`}>
        {spans.map((span) => {
          const left = dayPercent(span.start, midnight);
          const width = Math.max(0.6, dayPercent(span.end, midnight) - left);
          return <span key={span.start} className="study-mini-span" style={{ left: `${left}%`, width: `${width}%` }} />;
        })}
        <span className="study-mini-now" style={{ left: `${dayPercent(now.getTime(), midnight)}%` }} />
      </div>
      <div className="study-mini-hours" aria-hidden="true">
        {HOUR_LABELS.map((h) => (
          <span key={h} style={{ left: `${((h - DAY_START_H) / DAY_HOURS) * 100}%` }}>
            {h}
          </span>
        ))}
      </div>
    </div>
  );
}

export default StudyMini;
