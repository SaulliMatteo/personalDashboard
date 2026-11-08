import type { CSSProperties, MouseEvent } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import { formatGoal, formatHoursMinutes, formatHoursMinutesCompact } from "../lib/format";
import OthersToggle from "./OthersToggle";
import StudyCell from "./StudyCell";
import StudyControls from "./StudyControls";
import StudyWide from "./StudyWide";
import { useStudyCard, type StudyCardData, type SubjectRow } from "./useStudyCard";
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

  // 2×1, solo sul telefono
  if (size === "W") {
    return (
      <article className="widget so so--W">
        <StudyWide data={data} prefix="so" />
      </article>
    );
  }

  const focus = (
    <div className="so-focus">
      <div className="so-focus-line">
        <span className="so-focus-label">{focusLabel(data)}</span>
        {size !== "M" && (
          <span className="so-focus-label so-focus-today">
            Oggi {data.todayText}
            {data.goalSeconds > 0 && ` di ${formatGoal(data.goalSeconds)}`}
          </span>
        )}
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

/** "Nome · 1h05 di 1h30", "Nome · 1h30" se non ancora iniziata, "Nome · 30m" se completata o senza obiettivo. */
function chipText(row: SubjectRow): string {
  const name = row.subject.name;
  if (row.goalSeconds > 0 && !row.isDone) {
    const goal = formatHoursMinutesCompact(row.goalSeconds);
    return row.seconds >= 60 ? `${name} · ${formatHoursMinutesCompact(row.seconds)} di ${goal}` : `${name} · ${goal}`;
  }
  return row.seconds >= 60 ? `${name} · ${formatHoursMinutes(row.seconds)}` : name;
}

function Chips({ data }: { data: StudyCardData }) {
  if (data.rows.length === 0 && data.otherRows.length === 0) {
    return <p className="so-empty">{data.emptyText}</p>;
  }
  return (
    <div className="so-chips">
      {data.rows.map((row) => (
        <button
          key={row.subject.id}
          type="button"
          className={`so-chip${row.isActive ? " is-active" : ""}${row.isDone ? " is-done" : ""}`}
          disabled={row.isActive && data.isWork}
          title={row.isActive && data.isWork ? "Materia in corso" : `Studia ${row.subject.name}`}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            void data.switchSubject(row.subject.id);
          }}
        >
          {chipText(row)}
        </button>
      ))}
      <OthersToggle data={data} className="so-chip so-chip--toggle" label={`+${data.otherRows.length} altre`} />
    </div>
  );
}

export default StudyCardOpaco;
