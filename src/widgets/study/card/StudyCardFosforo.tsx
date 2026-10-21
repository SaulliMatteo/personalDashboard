import type { MouseEvent } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import type { SubjectMode } from "../data/studyRepository";
import { MODE_LABEL, formatHoursMinutes, formatHoursMinutesCompact } from "../lib/format";
import { DialFit, DotDial } from "../components/dial/Dials";
import StudyCell from "./StudyCell";
import StudyControls from "./StudyControls";
import { useStudyCard, visibleRows, type StudyCardData } from "./useStudyCard";
import "./StudyCardFosforo.css";

/** Celle della barra dell'obiettivo di oggi. */
const GOAL_CELLS = 18;
const MODES: SubjectMode[] = ["pomodoro", "stopwatch"];

/**
 * Tema Fosforo: modulo hardware. Quadrante a 60 puntini dentro un display,
 * numeri in Doto, LED rosso solo mentre il timer corre.
 */
function StudyCardFosforo({ size }: { size: SizeKey }) {
  const data = useStudyCard();

  if (size === "S") {
    return (
      <article className="widget sf sf--S">
        <StudyCell data={data} className="sf-cell">
          <span className="sf-cell-time">{data.clockText}</span>
          {data.isRunning && <span className="sf-led sf-cell-led" aria-hidden="true" />}
        </StudyCell>
      </article>
    );
  }

  const screen = (
    <div className="sf-screen">
      <DialFit max={220}>
        {(side) => (
          <DotDial size={side} progress={data.progress} running={data.isRunning}>
            <span className="sf-time">{data.clockText}</span>
            <span className="sf-phase">{data.phaseLabel}</span>
            {size === "M" && data.currentSubject && <span className="sf-subject">{data.currentSubject.name}</span>}
          </DotDial>
        )}
      </DialFit>
      <StudyControls data={data} className="sf-controls" iconSize={[15, 13]} round={[0, 0]} />
    </div>
  );

  if (size === "M") return <article className="widget sf sf--M">{screen}</article>;

  const body = (
    <div className="sf-body">
      {screen}
      <Side data={data} withCycles={size === "XL"} />
    </div>
  );

  if (size === "L") return <article className="widget sf sf--L">{body}</article>;

  return (
    <article className="widget sf sf--XL">
      <header className="sf-head">
        <span className="sf-title">
          {data.isRunning && <span className="sf-led" aria-hidden="true" />}
          Studio
        </span>
        <ModeSwitch data={data} />
      </header>
      {body}
    </article>
  );
}

/** Pomodoro / Cronometro: cambia la modalità della materia, solo a timer fermo. */
function ModeSwitch({ data }: { data: StudyCardData }) {
  const subject = data.currentSubject;
  if (!subject) return null;
  return (
    <div className="sf-modes" role="group" aria-label="Modalità">
      {MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          className={`sf-mode${subject.mode === mode ? " is-active" : ""}`}
          aria-pressed={subject.mode === mode}
          disabled={!data.isIdle}
          title={data.isIdle ? undefined : "Si cambia a timer fermo"}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            if (subject.mode !== mode) void data.updateSubject(subject.id, { mode });
          }}
        >
          {MODE_LABEL[mode]}
        </button>
      ))}
    </div>
  );
}

function Side({ data, withCycles }: { data: StudyCardData; withCycles: boolean }) {
  const rows = visibleRows(data.rows, 5);
  const lit = Math.round(data.goalProgress * GOAL_CELLS);
  return (
    <div className="sf-side">
      <div className="sf-today">
        <span className="sf-sec">Oggi</span>
        <span className="sf-total">{formatHoursMinutesCompact(data.todaySeconds)}</span>
      </div>
      {data.goalSeconds > 0 && (
        <div className="sf-goal" title={`Obiettivo ${formatHoursMinutes(data.goalSeconds)}`}>
          {Array.from({ length: GOAL_CELLS }, (_, i) => (
            <span key={i} aria-hidden="true" className={i < lit ? "is-on" : ""} />
          ))}
        </div>
      )}
      {rows.length === 0 && <p className="sf-sec sf-empty">{data.ready ? "Aggiungi materie dai dettagli del widget." : ""}</p>}
      <div className="sf-rows">
        {rows.map((row) => (
          <button
            key={row.subject.id}
            type="button"
            className={`sf-row${row.isActive ? " is-active" : ""}`}
            disabled={row.isActive && data.isWork}
            title={row.isActive && data.isWork ? "Materia in corso" : `Studia ${row.subject.name}`}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              void data.switchSubject(row.subject.id);
            }}
          >
            <span className="sf-row-name">{row.subject.name}</span>
            <span className="sf-row-time">{formatHoursMinutes(row.seconds)}</span>
          </button>
        ))}
      </div>
      {withCycles && data.cycles && (
        <div className="sf-sec sf-cycles">
          {data.cycles.label}.{data.nextPhaseShort ? ` ${data.nextPhaseShort}` : ""}
        </div>
      )}
    </div>
  );
}

export default StudyCardFosforo;
