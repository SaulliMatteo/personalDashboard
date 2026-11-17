import { useCalendarCard } from "../card/useCalendarCard";
import { nearDay } from "../lib/agenda";
import { clock } from "../lib/dates";
import { MONTHS, WEEKDAYS_LONG } from "../lib/format";
import { itemLabel } from "../lib/items";
import "./CalendarMini.css";

/**
 * Mini dell'intestazione (mockup: riquadro con mese e giorno, accanto il prossimo impegno e quando):
 * "nov 12 · Verifica di fisica · domani · 08:10". Senza impegni: la data di oggi.
 */
function CalendarMini() {
  const { data, next, now } = useCalendarCard(1);
  const first = next[0] ?? null;
  const day = new Date(first ? first.start : now);
  const near = first ? nearDay(first.start, now.getTime()) : null;
  const when = first
    ? `${near ?? `${WEEKDAYS_LONG[(day.getDay() + 6) % 7]} ${day.getDate()}`}${first.event.allDay ? "" : ` · ${clock(first.start)}`}`
    : `${WEEKDAYS_LONG[(now.getDay() + 6) % 7]}`;
  const title = first ? itemLabel(first, data) : "Nessun impegno";
  return (
    <div className="cal-mini" aria-label={first ? `Prossimo impegno: ${title}, ${when}` : `Oggi, ${when}: nessun impegno`}>
      <span className="cal-mini-box" aria-hidden="true">
        <span className="cal-mini-month">{MONTHS[day.getMonth()].slice(0, 3)}</span>
        <span className="cal-mini-day">{day.getDate()}</span>
      </span>
      <span className="cal-mini-text" aria-hidden="true">
        <span className="cal-mini-title">{title}</span>
        <span className="cal-mini-when">{when}</span>
      </span>
    </div>
  );
}

export default CalendarMini;
