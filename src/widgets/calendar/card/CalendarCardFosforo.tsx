import type { SizeKey } from "../../../core/widgets/sizes";
import { dayKey } from "../lib/dates";
import { MONTHS } from "../lib/format";
import CalendarCardNotte from "./CalendarCardNotte";
import { CardItems, CardViews, NewButton, WeekStrip } from "./ThemedCardParts";
import { useCalendarCard } from "./useCalendarCard";
import "./calendarCard.css";
import "./CalendarCardFosforo.css";

/*
 * Fosforo (proposta "Altri temi" del mockup): display a punti con "NOV 11" in Doto, selettore MESE/SETT/GG,
 * settimana con i numeri a due cifre, impegni in moduli col bordo sottile (evento = quadratino, come in tutti i temi),
 * nota tratteggiata, "+ NUOVO" a contorno. 1×1 e 2×1: la card di base, nello stile di Fosforo (CSS).
 */
function CalendarCardFosforo({ size }: { size: SizeKey }) {
  if (size === "S" || size === "W") return <CalendarCardNotte size={size} />;
  return <FosforoM />;
}

function FosforoM() {
  const { data, next, busy, now } = useCalendarCard(3);
  const todayNote = data.notes.find((n) => n.day === dayKey(now)) ?? null;
  const label = `${MONTHS[now.getMonth()].slice(0, 3).toUpperCase()} ${String(now.getDate()).padStart(2, "0")}`;
  return (
    <article className="widget calt calt--fosforo" aria-label={`Calendario, oggi ${now.getDate()} ${MONTHS[now.getMonth()]}`}>
      <header className="calt-head calt-display">
        <span className="calt-title" aria-hidden="true">
          {label}
        </span>
        <CardViews className="calt-views" />
      </header>
      <WeekStrip now={now} busy={busy} pad />
      <CardItems data={data} items={next} todayNote={todayNote} limit={3} compactDuration />
      <NewButton className="calt-new" label="+ Nuovo" />
    </article>
  );
}

export default CalendarCardFosforo;
