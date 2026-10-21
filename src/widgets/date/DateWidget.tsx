import WidgetFrame from "../../core/widgets/WidgetFrame";
import { useNow } from "../../core/hooks/useNow";
import { dateParts } from "./lib/parts";
import "./DateWidget.css";

/** 1×1: il numero del giorno in grande, sopra il giorno della settimana e sotto il mese. */
function DateWidget() {
  const now = useNow();
  const { day, month, weekday } = dateParts(now);
  return (
    <WidgetFrame>
      <article className="widget datew" aria-label={`Oggi è ${weekday} ${day} ${month}`}>
        <span className="datew-top" aria-hidden="true">{weekday}</span>
        <span className="datew-day" aria-hidden="true">{day}</span>
        <span className="datew-cap" aria-hidden="true">{month}</span>
      </article>
    </WidgetFrame>
  );
}

export default DateWidget;
