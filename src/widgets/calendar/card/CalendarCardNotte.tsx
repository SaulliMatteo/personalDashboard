import { Fragment, type CSSProperties } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import KindMark from "../components/KindMark";
import { clock, dayKey, isSameDay } from "../lib/dates";
import { MONTHS, WEEKDAYS_LONG, capitalize, relativeDay } from "../lib/format";
import { isFilled, itemColor, itemLabel } from "../lib/items";

import AgendaRow from "./AgendaRow";
import { useCalendarCard } from "./useCalendarCard";
import "./calendarCard.css";

/*
 * Card del Calendario in dashboard (mockup: "Widget in dashboard"):
 *  - 1×1: giorno della settimana, numero grande, prossimo impegno;
 *  - 2×1: data a sinistra, i prossimi 3 a destra;
 *  - 2×2: mini mese con i puntini sui giorni occupati, sotto l'agenda.
 * Le misure seguono la cella (container query in calendarCard.css): niente si taglia in celle più piccole.
 */

const INITIALS = ["L", "M", "M", "G", "V", "S", "D"];

function CalendarCardNotte({ size }: { size: SizeKey }) {
  const card = useCalendarCard(3);
  const { data, now, next, todayCount, grid, month, year, busy } = card;
  const weekday = WEEKDAYS_LONG[(now.getDay() + 6) % 7];

  if (size === "S") {
    const first = next[0];
    const color = first ? itemColor(first, data) : null;
    const when = first ? (isSameDay(first.start, now) ? (first.event.allDay ? "oggi" : clock(first.start)) : relativeDay(first.start, now)) : "";
    return (
      <article className="widget calc calc--S" aria-label={`Oggi è ${weekday} ${now.getDate()}`}>
        <span className="calc-top">{weekday}</span>
        <span className="calc-day">{now.getDate()}</span>
        <span className="calc-next" style={color ? ({ "--item": color } as CSSProperties) : undefined}>
          {first ? (
            <>
              <KindMark kind={first.event.kind} filled={isFilled(first, data.study)} className="calc-mark" />
              <span className="calc-muted">{when}</span> {itemLabel(first, data)}
            </>
          ) : (
            <span className="calc-muted">Nessun impegno</span>
          )}
        </span>
      </article>
    );
  }

  if (size === "W") {
    return (
      <article className="widget calc calc--W" aria-label={`Calendario: ${weekday} ${now.getDate()} ${MONTHS[now.getMonth()]}`}>
        <div className="calc-date">
          <span className="calc-top">{weekday}</span>
          <span className="calc-day">{now.getDate()}</span>
          <span className="calc-top">{MONTHS[now.getMonth()]}</span>
        </div>
        <div className="calc-vline" aria-hidden="true" />
        <div className="calc-list">
          {next.length === 0 ? (
            <span className="calc-muted calc-empty">Nessun impegno in programma</span>
          ) : (
            next.map((o, i) => (
              <Fragment key={o.key}>
                {i > 0 && <div className="calc-hline" aria-hidden="true" />}
                <AgendaRow o={o} data={data} />
              </Fragment>
            ))
          )}
        </div>
      </article>
    );
  }

  // 2×2 (e taglie più grandi)
  return (
    <article className="widget calc calc--M" aria-label={`Calendario di ${MONTHS[month]} ${year}`}>
      <div className="calc-head">
        <span className="calc-month">
          {capitalize(MONTHS[month])} <span className="calc-muted">{year}</span>
        </span>
        <span className="calc-muted calc-count">
          {todayCount === 0 ? "Niente oggi" : `${todayCount} ${todayCount === 1 ? "impegno" : "impegni"} oggi`}
        </span>
      </div>
      <div className="calc-grid" aria-hidden="true">
        {INITIALS.map((l, i) => (
          <span key={i} className="calc-wd">
            {l}
          </span>
        ))}
        {grid.map((d) => {
          const key = dayKey(d);
          const today = isSameDay(d, now);
          return (
            <span key={key} className={`calc-cell${d.getMonth() !== month ? " calc-cell--out" : ""}${busy.has(key) && !today ? " calc-cell--busy" : ""}`}>
              {today ? <span className="calc-today">{d.getDate()}</span> : d.getDate()}
            </span>
          );
        })}
      </div>
      <div className="calc-hline" aria-hidden="true" />
      <div className="calc-agenda">
        {next.length === 0 ? (
          <span className="calc-muted calc-empty">Nessun impegno in programma</span>
        ) : (
          next.map((o) => <AgendaRow key={o.key} o={o} data={data} />)
        )}
      </div>
    </article>
  );
}

export default CalendarCardNotte;
