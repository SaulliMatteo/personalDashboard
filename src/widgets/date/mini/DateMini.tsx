import { useNow } from "../../../core/hooks/useNow";
import { dateParts } from "../lib/parts";
import "./DateMini.css";

/** Mini da intestazione: numero del giorno nel font display, accanto giorno della settimana e mese. */
function DateMini() {
  const now = useNow();
  const { day, month, weekday } = dateParts(now);
  return (
    <div className="date-mini" aria-label={`Oggi è ${weekday} ${day} ${month}`}>
      <span className="date-mini-day" aria-hidden="true">{day}</span>
      <span className="date-mini-text" aria-hidden="true">
        <span>{weekday}</span>
        <span>{month}</span>
      </span>
    </div>
  );
}

export default DateMini;
