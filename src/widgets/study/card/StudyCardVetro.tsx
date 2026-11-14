import { createElement, type ComponentType, type CSSProperties, type MouseEvent } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import { MODE_LABEL, formatHoursMinutes } from "../lib/format";
import { CoreDial, DialFit, GlassDial, type DialProps } from "../components/dial/Dials";
import OthersToggle from "./OthersToggle";
import StudyCell from "./StudyCell";
import StudyControls from "./StudyControls";
import StudyWide from "./StudyWide";
import { useProgression } from "../progression/useProgression";
import { useStudyCard, type StudyCardData } from "./useStudyCard";
import "./StudyCardVetro.css";

/**
 * Temi Vetro e Ombra (Temi Vetro e Ombra.html, `.st`): nel mockup la card ha la stessa disposizione nei due temi,
 * cambiano il quadrante e il CSS (prefisso `sv`; le regole di Ombra sono in fondo a StudyCardVetro.css).
 * Vetro: tubo di vetro, pulsanti a pillola, materie in piccole lastre. Ombra: il nucleo, righe sottili, cicli come
 * piccoli nuclei.
 */
export function StudyCardVetro({ size }: { size: SizeKey }) {
  return <StudyCardLayout size={size} dial={GlassDial} />;
}

/** Ombra: al posto del tempo di oggi, i frammenti di oggi sull'obiettivo ("155 / 240 frammenti"). */
export function StudyCardOmbra({ size }: { size: SizeKey }) {
  const progression = useProgression();
  const fragments = progression
    ? `${progression.todayFragments}${progression.todayGoalFragments > 0 ? ` / ${progression.todayGoalFragments}` : ""} frammenti`
    : undefined;
  return <StudyCardLayout size={size} dial={CoreDial} todayAs={fragments} />;
}

/** `todayAs`: cosa scrivere al posto del tempo di oggi nell'intestazione delle materie. */
function StudyCardLayout({ size, dial, todayAs }: { size: SizeKey; dial: ComponentType<DialProps>; todayAs?: string }) {
  const data = useStudyCard({ withWeek: size === "XL" });

  if (size === "S") {
    return (
      <article className="widget sv sv--S">
        <StudyCell data={data} className="sv-cell">
          <span className="sv-cell-time">{data.clockText}</span>
          <span className="sv-cell-label">{data.currentSubject?.name ?? data.phaseLabel}</span>
          <span className="sv-bar sv-cell-bar" aria-hidden="true">
            <span style={{ width: `${data.progress * 100}%` }} />
          </span>
        </StudyCell>
      </article>
    );
  }

  // 2×1, solo sul telefono
  if (size === "W") {
    return (
      <article className="widget sv sv--W">
        <StudyWide data={data} prefix="sv" />
      </article>
    );
  }

  const timer = (
    <div className="sv-timer">
      <DialFit max={230}>
        {(side) => (
          createElement(
            dial,
            { size: side, progress: data.progress },
            <span className="sv-time">{data.clockText}</span>,
            <span className="sv-phase">{data.phaseLabel}</span>,
            data.currentSubject && <span className="sv-subject">{data.currentSubject.name}</span>,
          )
        )}
      </DialFit>
      <StudyControls data={data} className="sv-controls" iconSize={[18, 15]} />
    </div>
  );

  if (size === "M") return <article className="widget sv sv--M">{timer}</article>;

  const body = (
    <div className="sv-body">
      {timer}
      <Subjects data={data} max={4} withCycles={size === "L"} todayAs={todayAs} />
    </div>
  );

  if (size === "L") return <article className="widget sv sv--L">{body}</article>;

  return (
    <article className="widget sv sv--XL">
      <header className="sv-head">
        <h2>Studio</h2>
        {data.currentSubject && <span className="sv-chip">{MODE_LABEL[data.currentSubject.mode]}</span>}
      </header>
      {body}
      <Cycles data={data} />
      <section className="sv-week">
        <div className="sv-week-head">
          <span>Ultimi 7 giorni</span>
          <span className="sv-week-total">{formatHoursMinutes(data.weekSeconds)}</span>
        </div>
        <div className="sv-week-bars">
          {data.week.map((day, i) => (
            <span key={i} className={`sv-week-day${day.isToday ? " is-today" : ""}`}>
              <span className="sv-week-bar-area">
                <span className="sv-week-bar" style={{ height: `${day.share * 100}%` }} />
              </span>
              <span className="sv-week-initial">{day.initial}</span>
            </span>
          ))}
        </div>
      </section>
    </article>
  );
}

/** "Ciclo 2 di 4", i pallini e cosa viene dopo. */
function Cycles({ data }: { data: StudyCardData }) {
  if (!data.cycles) return null;
  const { cycles } = data;
  return (
    <div className="sv-cycles" title={cycles.label}>
      <span>{cycles.label}</span>
      {Array.from({ length: cycles.total }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`sv-cycle${i < cycles.done ? " is-done" : i === cycles.done && cycles.inProgress ? " is-current" : ""}`}
        />
      ))}
      {data.nextPhaseText && <span className="sv-next">{data.nextPhaseText}</span>}
    </div>
  );
}

function Subjects({ data, max, withCycles, todayAs }: { data: StudyCardData; max: number; withCycles: boolean; todayAs?: string }) {
  const rows = data.fitRows(max);
  return (
    <div className="sv-subjects">
      <div className="sv-subjects-head">
        <span>Materie di {data.todayName}</span>
        {todayAs ? (
          <b>{todayAs}</b>
        ) : (
          <b>
            {data.todayText}
            {data.goalText && <span className="sv-muted"> / {data.goalText}</span>}
          </b>
        )}
      </div>
      {rows.length === 0 && <p className="sv-empty">{data.emptyText}</p>}
      {rows.map((row) => (
        <button
          key={row.subject.id}
          type="button"
          className={`sv-row${row.isActive ? " is-active" : ""}${row.isDone ? " is-done" : ""}`}
          style={{ "--subject-color": row.color } as CSSProperties}
          disabled={row.isActive && data.isWork}
          title={row.isActive && data.isWork ? "Materia in corso" : `Studia ${row.subject.name}`}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            void data.switchSubject(row.subject.id);
          }}
        >
          <span className="sv-row-line">
            <span className="sv-row-name">
              <span className="sv-row-dot" aria-hidden="true" />
              {row.subject.name}
            </span>
            <span className="sv-row-time">
              {formatHoursMinutes(row.seconds)}
              {row.goalSeconds > 0 && <span className="sv-muted"> / {formatHoursMinutes(row.goalSeconds)}</span>}
            </span>
          </span>
          <span className="sv-bar sv-row-bar" aria-hidden="true">
            <span style={{ width: `${row.share * 100}%` }} />
          </span>
        </button>
      ))}
      <OthersToggle data={data} className="sv-others-toggle" label={`Altre materie · ${data.otherRows.length}`} />
      {withCycles && <Cycles data={data} />}
    </div>
  );
}

