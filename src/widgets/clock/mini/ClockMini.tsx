import { useNow } from "../../../core/hooks/useNow";
import { clockText } from "../../../core/time/format";
import "./ClockMini.css";

/** Mini da intestazione: l'ora nel font display del tema (in Fosforo è l'orologio a punti del mockup). */
function ClockMini() {
  const now = useNow();
  return (
    <time className="clock-mini" dateTime={now.toISOString()}>
      {clockText(now)}
    </time>
  );
}

export default ClockMini;
