import type { SizeKey } from "../../../core/widgets/sizes";
import { dayKey } from "../lib/dates";
import { MONTHS, capitalize } from "../lib/format";
import CalendarCardNotte from "./CalendarCardNotte";
import { CardItems, CardViews, NewButton, WeekStrip } from "./ThemedCardParts";
import { useCalendarCard } from "./useCalendarCard";
import "./calendarCard.css";
import "./CalendarCardQuaderno.css";

/*
 * Quaderno (proposta "Altri temi" del mockup): mese scritto a mano (Caveat), selettore a riquadro con la voce blu
 * piena, oggi cerchiato a penna e un po' storto, impegni su righe del quaderno, la nota del giorno è un post-it,
 * "+ Nuovo" a contorno blu. 1×1 e 2×1: la card di base, nello stile del Quaderno (CSS).
 */
function CalendarCardQuaderno({ size }: { size: SizeKey }) {
  if (size === "S" || size === "W") return <CalendarCardNotte size={size} />;
  return <QuadernoM />;
}

function QuadernoM() {
  const { data, next, busy, now } = useCalendarCard(3);
  const todayNote = data.notes.find((n) => n.day === dayKey(now)) ?? null;
  return (
    <article className="widget calt calt--quaderno" aria-label={`Calendario di ${MONTHS[now.getMonth()]}`}>
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

export default CalendarCardQuaderno;
