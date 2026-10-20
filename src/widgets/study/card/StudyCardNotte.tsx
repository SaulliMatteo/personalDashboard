import type { CSSProperties, MouseEvent } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import { MODE_LABEL, formatHoursMinutes } from "../lib/format";
import { DialFit, TickDial } from "../components/dial/Dials";
import StudyCell from "./StudyCell";
import StudyControls from "./StudyControls";
import { useStudyCard, visibleRows, type StudyCardData } from "./useStudyCard";
import "./StudyCardNotte.css";

/** Tema Notte: ghiera di tacche, righe delle materie con barra sottile, grafico in un pannello. */
function StudyCardNotte({ size }: { size: SizeKey }) {
  const data = useStudyCard({ withWeek: size === "XL" });

  if (size === "S") {
    return (
      <article className="widget sn sn--S">
        <StudyCell data={data} className="sn-cell">
          <span className="sn-cell-time">{data.clockText}</span>
          <span className="sn-cell-line" aria-hidden="true">
            <span style={{ width: `${data.progress * 100}%` }} />
          </span>
        </StudyCell>
      </article>
    );
  }

  const timer = (
    <div className="sn-timer">
      <DialFit max={236}>
        {(side) => (
          <TickDial size={side} progress={data.progress}>
            <span className="sn-time">{data.clockText}</span>
            <span className="sn-phase">{data.phaseLabel}</span>
            {data.currentSubject && <span className="sn-subject">{data.currentSubject.name}</span>}
          </TickDial>
        )}
      </DialFit>
      <StudyControls data={data} className="sn-controls" iconSize={[18, 15]} />
    </div>
  );

  if (size === "M") return <article className="widget sn sn--M">{timer}</article>;

  const body = (
    <div className="sn-body">
      {timer}
      <Subjects data={data} max={5} withTotal={size === "L"} withNextPhase={size === "XL"} />
    </div>
  );

  if (size === "L") return <article className="widget sn sn--L">{body}</article>;

  return (
    <article className="widget sn sn--XL">
      <header className="sn-head">
        <div className="sn-head-title">
          <h2>Studio</h2>
          {data.currentSubject && <span className="sn-chip">{MODE_LABEL[data.currentSubject.mode]}</span>}
        </div>
        {data.cycles && (
          <div className="sn-cycles" title={data.cycles.label}>
            <span>{data.cycles.label}</span>
            {Array.from({ length: data.cycles.total }, (_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`sn-cycle${i < data.cycles!.done ? " is-done" : i === data.cycles!.done && data.cycles!.inProgress ? " is-current" : ""}`}
              />
            ))}
          </div>
        )}
      </header>
      {body}
      <section className="sn-week">
        <div className="sn-week-head">
          <span>Ultimi 7 giorni</span>
          <span className="sn-week-total">{formatHoursMinutes(data.weekSeconds)}</span>
        </div>
        <div className="sn-week-bars">
          {data.week.map((day, i) => (
            <span key={i} className={`sn-week-day${day.isToday ? " is-today" : ""}`}>
              <span className="sn-week-bar-area">
                <span className="sn-week-bar" style={{ height: `${day.share * 100}%` }} />
              </span>
              <span className="sn-week-initial">{day.initial}</span>
            </span>
          ))}
        </div>
      </section>
    </article>
  );
}

function Subjects({ data, max, withTotal, withNextPhase }: { data: StudyCardData; max: number; withTotal: boolean; withNextPhase: boolean }) {
  const rows = visibleRows(data.rows, max);
  return (
    <div className="sn-subjects">
      <div className="sn-subjects-head">
        <span>Materie di oggi</span>
        {withTotal && <span className="sn-subjects-total">{data.todayText}</span>}
      </div>
      {rows.length === 0 && <p className="sn-empty">{data.ready ? "Aggiungi materie dai dettagli del widget." : ""}</p>}
      {rows.map((row) => (
        <button
          key={row.subject.id}
          type="button"
          className={`sn-row${row.isActive ? " is-active" : ""}`}
          style={{ "--subject-color": row.color } as CSSProperties}
          disabled={row.isActive && data.isWork}
          title={row.isActive && data.isWork ? "Materia in corso" : `Studia ${row.subject.name}`}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            void data.switchSubject(row.subject.id);
          }}
        >
          <span className="sn-row-line">
            <span className="sn-row-name">
              <span className="sn-row-dot" aria-hidden="true" />
              {row.subject.name}
            </span>
            <span className="sn-row-time">{formatHoursMinutes(row.seconds)}</span>
          </span>
          <span className="sn-row-bar" aria-hidden="true">
            <span style={{ width: `${row.share * 100}%` }} />
          </span>
        </button>
      ))}
      {withNextPhase && data.nextPhaseText && <div className="sn-next">{data.nextPhaseText}</div>}
    </div>
  );
}

export default StudyCardNotte;
