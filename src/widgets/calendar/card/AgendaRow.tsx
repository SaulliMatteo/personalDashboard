import type { CSSProperties } from "react";
import KindMark from "../components/KindMark";
import type { CalendarData } from "../hooks/useCalendarData";
import { nearDay } from "../lib/agenda";
import { clock, durationText } from "../lib/dates";
import { WEEKDAYS_SHORT } from "../lib/format";
import { isFilled, itemColor, itemLabel } from "../lib/items";
import type { Occurrence } from "../lib/types";

/**
 * Una riga dell'agenda delle card (mockup: "15:00 ○ Matematica 1h 30m", "08:10 ■ Verifica di fisica domani"):
 * ora, forma del tipo, nome; a destra la durata (sessioni di oggi) o il giorno (domani, gio 13).
 */
function AgendaRow({ o, data, className }: { o: Occurrence; data: CalendarData; className?: string }) {
  const now = data.now.getTime();
  const near = nearDay(o.start, now);
  const d = new Date(o.start);
  const day = near === "oggi" ? null : (near ?? `${WEEKDAYS_SHORT[(d.getDay() + 6) % 7].toLowerCase()} ${d.getDate()}`);
  const right = day ?? (o.event.kind === "study" ? durationText((o.end - o.start) / 1000) : "");
  const color = itemColor(o, data);
  const label = itemLabel(o, data);
  const time = o.event.allDay ? "giorno" : clock(o.start);
  return (
    <div
      className={`cal-agenda-row${className ? ` ${className}` : ""}`}
      style={color ? ({ "--item": color } as CSSProperties) : undefined}
      aria-label={`${time} ${label}${right ? `, ${right}` : ""}`}
    >
      <span className="cal-agenda-time">{time}</span>
      <KindMark kind={o.event.kind} filled={isFilled(o, data.study)} className="cal-agenda-mark" />
      <span className="cal-agenda-name">{label}</span>
      {right && <span className="cal-agenda-right">{right}</span>}
    </div>
  );
}

export default AgendaRow;
