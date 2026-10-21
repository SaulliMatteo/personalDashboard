import WidgetFrame from "../../core/widgets/WidgetFrame";
import { useNow } from "../../core/hooks/useNow";
import { clockText } from "../../core/time/format";
import "./ClockWidget.css";

/** "mar 21". */
function shortDay(date: Date): string {
  return date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" });
}

/** 1×1: l'ora in grande con il font display del tema, sotto il giorno. */
function ClockWidget() {
  const now = useNow();
  return (
    <WidgetFrame>
      <article className="widget clockw">
        <time className="clockw-time" dateTime={now.toISOString()}>
          {clockText(now)}
        </time>
        <span className="clockw-cap">{shortDay(now)}</span>
      </article>
    </WidgetFrame>
  );
}

export default ClockWidget;
