import { useMemo, type CSSProperties } from "react";
import KindMark from "../components/KindMark";
import type { CalendarData } from "../hooks/useCalendarData";
import { addDays, clock, dayKey, durationText, isSameDay, startOfDay } from "../lib/dates";
import { longDate } from "../lib/format";
import { isFilled, itemColor, itemLabel } from "../lib/items";
import { reminderLabel } from "../lib/reminders";
import type { Occurrence } from "../lib/types";
import { MdClose } from "react-icons/md";
import LinkNoteButton from "../components/LinkNoteButton";
import { linkNote, unlinkNote } from "../data/noteLinkOps";
import "./DaySidebar.css";

/*
 * Colonna destra della vista Giorno (mockup, 316 px): sessione in corso (o la prossima), note collegate al giorno,
 * il giorno dopo.
 */

interface DaySidebarProps {
  day: Date;
  data: CalendarData;
  onOpen: (occurrence: Occurrence, anchor: HTMLElement) => void;
  onOpenNote: (noteId: number) => void;
  onOpenTimer: (subjectId: number | null) => void;
}

const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

function DaySidebar({ day, data, onOpen, onOpenNote, onOpenTimer }: DaySidebarProps) {
  const now = data.now;
  const nowMs = now.getTime();
  const dayStart = startOfDay(day).getTime();
  const nextDay = addDays(startOfDay(day), 1).getTime();
  const isToday = isSameDay(day, now);

  const sessions = useMemo(
    () => data.occurrences.filter((o) => o.event.kind === "study" && o.start < nextDay && o.end > dayStart),
    [data.occurrences, dayStart, nextDay]
  );
  const running = sessions.find((o) => data.study.get(o.key)?.state === "running") ?? null;
  const upcoming = isToday ? (sessions.find((o) => o.start > nowMs) ?? null) : null;

  // Note del giorno e note degli elementi del giorno (una volta sola ciascuna).
  const notes = useMemo(() => {
    const ofDay = data.notes.filter((n) => n.day === dayKey(day));
    const ofItems = data.occurrences
      .filter((o) => o.start < nextDay && o.end > dayStart)
      .flatMap((o) => data.eventNotes.get(o.event.id) ?? []);
    const seen = new Set<number>();
    return [...ofDay, ...ofItems].filter((n) => (seen.has(n.noteId) ? false : (seen.add(n.noteId), true)));
  }, [data.notes, data.occurrences, data.eventNotes, day, dayStart, nextDay]);
  const tomorrow = data.occurrences.filter((o) => o.start >= nextDay && o.start < addDays(nextDay, 1).getTime());
  const firstTomorrow = tomorrow.find((o) => !o.event.allDay) ?? tomorrow[0] ?? null;

  // ---------- sessione ----------
  let sessionCard;
  if (running) {
    const info = data.study.get(running.key);
    const planned = (running.end - running.start) / 1000;
    const done = info?.doneSeconds ?? 0;
    const ratio = planned > 0 ? Math.min(1, done / planned) : 0;
    const color = itemColor(running, data);
    sessionCard = (
      <section className="cal-side-card" style={color ? ({ "--item": color } as CSSProperties) : undefined}>
        <h2>Sessione in corso</h2>
        <div className="cal-side-session">
          <svg width="52" height="52" viewBox="0 0 52 52" role="img" aria-label={`Sessione completata al ${Math.round(ratio * 100)}%`}>
            <circle cx="26" cy="26" r={RING_R} className="cal-side-ring-track" />
            <circle
              cx="26"
              cy="26"
              r={RING_R}
              className="cal-side-ring"
              strokeDasharray={`${ratio * RING_C} ${RING_C}`}
              transform="rotate(-90 26 26)"
            />
          </svg>
          <div>
            <span className="cal-side-big">{itemLabel(running, data)}</span>
            <span className="cal-side-sub">
              {durationText(done)} di {durationText(planned)}
            </span>
          </div>
        </div>
        <button type="button" className="cal-btn-ghost cal-side-wide" onClick={() => onOpenTimer(running.event.subjectId)}>
          Apri il timer
        </button>
      </section>
    );
  } else if (upcoming) {
    sessionCard = (
      <section className="cal-side-card">
        <h2>Prossima sessione</h2>
        <button
          type="button"
          className="cal-side-row"
          style={itemColor(upcoming, data) ? ({ "--item": itemColor(upcoming, data) } as CSSProperties) : undefined}
          onClick={(e) => onOpen(upcoming, e.currentTarget)}
        >
          <span className="cal-side-time">{clock(upcoming.start)}</span>
          <KindMark kind="study" />
          <span className="cal-side-name">{itemLabel(upcoming, data)}</span>
          <span className="cal-side-sub">{durationText((upcoming.end - upcoming.start) / 1000)}</span>
        </button>
        <button type="button" className="cal-btn-ghost cal-side-wide" onClick={() => onOpenTimer(upcoming.event.subjectId)}>
          Apri il timer
        </button>
      </section>
    );
  } else {
    const planned = sessions.reduce((sum, o) => sum + (o.end - o.start) / 1000, 0);
    const done = sessions.reduce((sum, o) => sum + (data.study.get(o.key)?.doneSeconds ?? 0), 0);
    sessionCard = (
      <section className="cal-side-card">
        <h2>Studio</h2>
        <p className="cal-side-empty">
          {sessions.length === 0
            ? "Nessuna sessione pianificata."
            : `${durationText(done)} fatte su ${durationText(planned)} in programma.`}
        </p>
        {isToday && (
          <button type="button" className="cal-btn-ghost cal-side-wide" onClick={() => onOpenTimer(null)}>
            Apri il timer
          </button>
        )}
      </section>
    );
  }

  return (
    <aside className="cal-side" aria-label="Riepilogo del giorno">
      {sessionCard}

      <section className="cal-side-card">
        <h2>Note collegate</h2>
        {notes.map((n) => {
          const ref = data.noteRefs.get(n.noteId);
          const title = ref?.title || "Nota senza titolo";
          return (
            <div key={n.id} className="cal-side-note-row">
              <button type="button" className="cal-side-note" onClick={() => onOpenNote(n.noteId)}>
                <i className="cal-side-note-icon" aria-hidden="true" />
                <span className="cal-side-note-text">
                  <span>{title}</span>
                  <span className="cal-side-sub">{ref?.folderName ? `Quaderno · ${ref.folderName}` : "Quaderno"}</span>
                </span>
              </button>
              <button
                type="button"
                className="cal-mini-remove cal-side-note-remove"
                aria-label={`Scollega la nota ${title}`}
                title={n.eventId !== null ? "Scollega la nota dall'elemento" : "Scollega la nota dal giorno"}
                onClick={() => void unlinkNote(n.id).catch((error) => console.error("Calendario: nota non scollegata", error))}
              >
                <MdClose aria-hidden="true" />
              </button>
            </div>
          );
        })}
        <LinkNoteButton
          label="+ Collega una nota"
          className="cal-side-link"
          exclude={notes.map((n) => n.noteId)}
          onPick={(note) =>
            void linkNote(note.id, { day: dayKey(day), eventId: null }).catch((error) => console.error("Calendario: nota non collegata", error))
          }
        />
      </section>

      <section className="cal-side-card">
        <h2>{isToday ? "Domani" : longDate(nextDay, now)}</h2>
        {firstTomorrow ? (
          <>
            <button
              type="button"
              className="cal-side-row"
              style={itemColor(firstTomorrow, data) ? ({ "--item": itemColor(firstTomorrow, data) } as CSSProperties) : undefined}
              onClick={(e) => onOpen(firstTomorrow, e.currentTarget)}
            >
              <span className="cal-side-time">{firstTomorrow.event.allDay ? "giorno" : clock(firstTomorrow.start)}</span>
              <KindMark kind={firstTomorrow.event.kind} filled={isFilled(firstTomorrow, data.study)} />
              <span className="cal-side-name">{itemLabel(firstTomorrow, data)}</span>
            </button>
            <div className="cal-side-chips">
              {tomorrow.length > 1 && (
                <span className="cal-side-tag">
                  {tomorrow.length - 1} {tomorrow.length === 2 ? "altro impegno" : "altri impegni"}
                </span>
              )}
              {firstTomorrow.event.reminders.slice(0, 2).map((r, i) => (
                <span key={i} className="cal-side-tag">
                  Promemoria: {reminderLabel(r)}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="cal-side-empty">Niente in programma.</p>
        )}
      </section>
    </aside>
  );
}

export default DaySidebar;
