import type { CSSProperties } from "react";
import { useOpenCalendar, type View } from "./useOpenCalendar";
import KindMark from "../components/KindMark";
import type { CalendarData } from "../hooks/useCalendarData";
import { nearDay } from "../lib/agenda";
import { clock, dayKey, durationText, isSameDay, weekDays } from "../lib/dates";
import { WEEKDAYS_SHORT } from "../lib/format";
import { isFilled, itemColor, itemLabel } from "../lib/items";
import type { NoteLink, Occurrence } from "../lib/types";
import "./themedCard.css";

/*
 * Pezzi delle card 2×2 di Opaco, Quaderno e Fosforo (mockup, tavola "Altri temi"): selettore delle viste (apre il
 * Calendario in quella vista), striscia della settimana, elenco (impegni e nota del giorno), "+ Nuovo".
 * Ogni tema li mette insieme a modo suo e li disegna col suo CSS.
 */

const SEG: { view: View; label: string; short: string }[] = [
  { view: "month", label: "Mese", short: "Mese" },
  { view: "week", label: "Settimana", short: "Sett." },
  { view: "day", label: "Giorno", short: "Giorno" },
];

/** Mese · Sett. · Giorno: scorciatoie che aprono il Calendario in quella vista ("Mese" è quella della card). */
export function CardViews({ className }: { className: string }) {
  const { openView } = useOpenCalendar();
  return (
    <nav className={className} aria-label="Apri il Calendario">
      {SEG.map((s) => (
        <button
          key={s.view}
          type="button"
          className={s.view === "month" ? "active" : ""}
          aria-label={`Apri la vista ${s.label}`}
          onClick={(e) => {
            e.stopPropagation();
            openView(s.view);
          }}
        >
          {s.short}
        </button>
      ))}
    </nav>
  );
}

/** La settimana di oggi: iniziale e numero, oggi segnato (la forma del segno la decide il CSS del tema). */
export function WeekStrip({ now, busy, pad = false }: { now: Date; busy: ReadonlySet<string>; pad?: boolean }) {
  return (
    <div className="calt-week" aria-hidden="true">
      {weekDays(now).map((d, i) => {
        const today = isSameDay(d, now);
        return (
          <div key={i} className={`calt-weekday${busy.has(dayKey(d)) ? " calt-weekday--busy" : ""}`}>
            <span className="calt-weekday-l">{WEEKDAYS_SHORT[i].charAt(0)}</span>
            <span className={today ? "calt-weekday-n calt-weekday-n--today" : "calt-weekday-n"}>
              {pad ? String(d.getDate()).padStart(2, "0") : d.getDate()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A destra di una riga: l'ora (oggi), la durata (sessioni di oggi senza ora utile), "domani" o il giorno. */
function rightText(o: Occurrence, now: number, compactDuration: boolean): string {
  const near = nearDay(o.start, now);
  if (near === "domani") return "domani";
  if (near === null) {
    const d = new Date(o.start);
    return `${WEEKDAYS_SHORT[(d.getDay() + 6) % 7].toLowerCase()} ${d.getDate()}`;
  }
  if (o.event.kind === "study") {
    const t = durationText((o.end - o.start) / 1000);
    return compactDuration ? t.replace(/h (\d+)m$/, "h$1").replace(/ /g, "") : t;
  }
  return o.event.allDay ? "oggi" : clock(o.start);
}

/**
 * Elenco della card: i prossimi impegni (fino a `limit`) e, nell'ultimo posto, la prima nota collegata a oggi
 * (con la sua forma: tratteggiata, o post-it in Quaderno).
 */
export function CardItems({
  data,
  items,
  todayNote,
  limit,
  compactDuration = false,
}: {
  data: CalendarData;
  items: Occurrence[];
  todayNote: NoteLink | null;
  limit: number;
  compactDuration?: boolean;
}) {
  const now = data.now.getTime();
  const shown = items.slice(0, todayNote ? limit - 1 : limit);
  if (shown.length === 0 && !todayNote) return <p className="calt-empty">Nessun impegno in programma</p>;
  return (
    <div className="calt-items">
      {shown.map((o) => {
        const color = itemColor(o, data);
        const label = itemLabel(o, data);
        const right = rightText(o, now, compactDuration);
        return (
          <div
            key={o.key}
            className={`calt-item calt-item--${o.event.kind}`}
            style={color ? ({ "--item": color } as CSSProperties) : undefined}
            aria-label={`${label}, ${right}`}
          >
            <KindMark kind={o.event.kind} filled={isFilled(o, data.study)} className="calt-mark" />
            <span className="calt-item-name">{label}</span>
            <span className="calt-item-right">{right}</span>
          </div>
        );
      })}
      {todayNote && (
        <div className="calt-item calt-item--note" aria-label={`Nota: ${data.noteRefs.get(todayNote.noteId)?.title ?? ""}`}>
          <KindMark kind="note" className="calt-mark" />
          <span className="calt-item-name">{data.noteRefs.get(todayNote.noteId)?.title || "Nota senza titolo"}</span>
        </div>
      )}
    </div>
  );
}

export function NewButton({ className, label }: { className: string; label: string }) {
  const { openNew } = useOpenCalendar();
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        openNew();
      }}
    >
      {label}
    </button>
  );
}
