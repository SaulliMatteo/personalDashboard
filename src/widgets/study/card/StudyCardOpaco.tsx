import type { CSSProperties, MouseEvent } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import { formatHoursMinutes } from "../lib/format";
import StudyCell from "./StudyCell";
import StudyControls from "./StudyControls";
import { useStudyCard, type StudyCardData } from "./useStudyCard";
import "./StudyCardOpaco.css";

/**
 * Tema Opaco: niente quadrante. Il tempo è un numero enorme sul pigmento
 * salvia, con una barra spessa; le materie sono chip a pillola.
 */
function StudyCardOpaco({ size }: { size: SizeKey }) {
  const data = useStudyCard();
  const chars = { "--chars": data.clockText.length } as CSSProperties;

  if (size === "S") {
    return (
      <article className="widget so so--S">
        <StudyCell data={data} className="so-cell">
          <span className="so-cell-time">{data.clockText}</span>
        </StudyCell>
      </article>
    );
  }

  const focus = (
    <div className="so-focus">
      <div className="so-focus-line">
        <span className="so-focus-label">{focusLabel(data)}</span>
        {size === "L" && <span className="so-focus-label">Oggi {data.todayText}</span>}
      </div>
      <div className="so-time" style={chars}>
        {data.clockText}
      </div>
      <div className="so-bar" aria-hidden="true">
        <div style={{ width: `${data.progress * 100}%` }} />
      </div>
    </div>
  );

  const controls = <StudyControls data={data} className="so-controls" iconSize={[18, 16]} round={[1.5, 3]} />;

  if (size === "M") {
    return (
      <article className="widget so so--M">
        {focus}
        {controls}
      </article>
    );
  }

  return (
    <article className={`widget so so--${size}`}>
      {size === "XL" && (
        <header className="so-head">
          <h2>Studio</h2>
          {data.cycles && (
            <div className="so-cycles" title={data.cycles.label}>
              {Array.from({ length: data.cycles.total }, (_, i) => (
                <span
                  key={i}
                  className={`so-cycle${i < data.cycles!.done ? " is-done" : i === data.cycles!.done && data.cycles!.inProgress ? " is-current" : ""}`}
                />
              ))}
            </div>
          )}
        </header>
      )}
      {focus}
      <div className="so-foot">
        <Chips data={data} />
        {controls}
      </div>
    </article>
  );
}

function focusLabel(data: StudyCardData) {
  if (data.isIdle) return data.currentSubject ? `Pronto per ${data.currentSubject.name}` : "Pronto";
  if (data.isBreak || data.isStopwatch || !data.currentSubject) return data.phaseLabel;
  return `${data.phaseLabel} su ${data.currentSubject.name}`;
}

function Chips({ data }: { data: StudyCardData }) {
  if (data.rows.length === 0) {
    return <p className="so-empty">{data.ready ? "Aggiungi materie dai dettagli del widget." : ""}</p>;
  }
  return (
    <div className="so-chips">
      {data.rows.map((row) => (
        <button
          key={row.subject.id}
          type="button"
          className={`so-chip${row.isActive ? " is-active" : ""}`}
          disabled={row.isActive && data.isWork}
          title={row.isActive && data.isWork ? "Materia in corso" : `Studia ${row.subject.name}`}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            void data.switchSubject(row.subject.id);
          }}
        >
          {row.seconds >= 60 ? `${row.subject.name} · ${formatHoursMinutes(row.seconds)}` : row.subject.name}
        </button>
      ))}
    </div>
  );
}

export default StudyCardOpaco;
