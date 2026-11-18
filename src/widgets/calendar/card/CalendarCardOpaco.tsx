import type { SizeKey } from "../../../core/widgets/sizes";
import { dayKey } from "../lib/dates";
import { MONTHS, capitalize } from "../lib/format";
import CalendarCardNotte from "./CalendarCardNotte";
import { CardItems, CardViews, NewButton, WeekStrip } from "./ThemedCardParts";
import { useCalendarCard } from "./useCalendarCard";
import "./calendarCard.css";
import "./CalendarCardOpaco.css";

/*
 * Opaco (proposta "Altri temi" del mockup): tutto nel pigmento malva; mese in grande nero pieno, selettore a pillola,
 * settimana con oggi in un cerchio d'inchiostro, impegni in pillole chiare, nota in una pillola tratteggiata,
 * "+ Nuovo" pillola d'inchiostro. 1×1 e 2×1: la card di base, nello stile di Opaco (CSS).
 */
function CalendarCardOpaco({ size }: { size: SizeKey }) {
  if (size === "S" || size === "W") return <CalendarCardNotte size={size} />;
  return <OpacoM />;
}

function OpacoM() {
  const { data, next, busy, now } = useCalendarCard(3);
  const todayNote = data.notes.find((n) => n.day === dayKey(now)) ?? null;
  return (
    <article className="widget calt calt--opaco" aria-label={`Calendario di ${MONTHS[now.getMonth()]}`}>
      <header className="calt-head">
        <span className="calt-title">{capitalize(MONTHS[now.getMonth()])}</span>
        <CardViews className="calt-views" />
      </header>
      <WeekStrip now={now} busy={busy} />
      <CardItems data={data} items={next} todayNote={todayNote} limit={3} />
      <NewButton className="calt-new" label="+ Nuovo" />
    </article>
  );
}

export default CalendarCardOpaco;
