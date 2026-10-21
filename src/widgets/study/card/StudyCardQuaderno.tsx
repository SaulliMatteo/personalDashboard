import type { MouseEvent } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import { MODE_LABEL, formatHoursMinutes } from "../lib/format";
import { DialFit, PenDial } from "../components/dial/Dials";
import StudyCell from "./StudyCell";
import StudyControls from "./StudyControls";
import { useStudyCard, visibleRows, type StudyCardData } from "./useStudyCard";
import "./StudyCardQuaderno.css";

// Linea "a penna" sotto il tempo della 1×1.
const PEN_LINE = "M2 6 C30 3 70 8 108 4";

/** Tema Quaderno: cerchio a penna, numeri scritti a mano, evidenziatore sulla materia attiva. */
function StudyCardQuaderno({ size }: { size: SizeKey }) {
  const data = useStudyCard({ withWeek: size === "XL" });

  if (size === "S") {
    const p = data.progress * 100;
    return (
      <article className="widget sq sq--S">
        <StudyCell data={data} className="sq-cell">
          <span className="sq-cell-time">{data.clockText}</span>
          <svg width="110" height="10" viewBox="0 0 110 10" aria-hidden="true" className="sq-cell-line">
            <path className="sq-line-track" d={PEN_LINE} />
            {p > 0 && <path className="sq-line-ink" d={PEN_LINE} pathLength={100} strokeDasharray={`${p} 100`} />}
          </svg>
        </StudyCell>
      </article>
    );
  }

  const timer = (
    <div className="sq-timer">
      <DialFit max={220}>
        {(side) => (
          <PenDial size={side} progress={data.progress}>
            <span className="sq-time">{data.clockText}</span>
            <span className="sq-phase">{data.phaseLabel}</span>
            {size === "M" && data.currentSubject && <span className="sq-subject">{data.currentSubject.name}</span>}
          </PenDial>
        )}
      </DialFit>
      <StudyControls data={data} className="sq-controls" iconSize={[18, 15]} />
    </div>
  );

  if (size === "M") return <article className="widget sq sq--M">{timer}</article>;

  const body = (
    <div className="sq-body">
      {timer}
      <Subjects data={data} />
    </div>
  );

  if (size === "L") return <article className="widget sq sq--L">{body}</article>;

  const mode = data.currentSubject ? MODE_LABEL[data.currentSubject.mode] : null;
  return (
    <article className="widget sq sq--XL">
      <header className="sq-head">
        <h2>Studio</h2>
        {mode && <span className="sq-head-meta">{data.cycles ? `${mode}, ${data.cycles.label.toLowerCase()}` : mode}</span>}
      </header>
      {body}
      <div className="sq-week" title={`Ultimi 7 giorni: ${formatHoursMinutes(data.weekSeconds)}`}>
        {data.week.map((day, i) => (
          <span key={i} className={`sq-week-day${day.isToday ? " is-today" : ""}`}>
            <span className="sq-week-bar-area">
              <span className="sq-week-bar" style={{ height: `${day.share * 100}%` }} />
            </span>
            <span className="sq-week-initial">{day.initial}</span>
          </span>
        ))}
      </div>
    </article>
  );
}

function Subjects({ data }: { data: StudyCardData }) {
  const rows = visibleRows(data.rows, 5);
  return (
    <div className="sq-subjects">
      <div className="sq-subjects-head">
        <span>Oggi</span>
        <span className="sq-total">{data.todayText}</span>
      </div>
      {rows.length === 0 && <p className="sq-empty">{data.ready ? "Aggiungi materie dai dettagli del widget." : ""}</p>}
      <div className="sq-rows">
        {rows.map((row) => (
          <button
            key={row.subject.id}
            type="button"
            className={`sq-row${row.isActive ? " is-active" : ""}`}
            disabled={row.isActive && data.isWork}
            title={row.isActive && data.isWork ? "Materia in corso" : `Studia ${row.subject.name}`}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              void data.switchSubject(row.subject.id);
            }}
          >
            <span className="sq-row-name">
              <span>{row.subject.name}</span>
            </span>
            <span className="sq-row-time">{formatHoursMinutes(row.seconds)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default StudyCardQuaderno;
