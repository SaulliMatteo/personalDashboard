import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdKeyboardDoubleArrowRight } from "react-icons/md";
import ConfirmButton from "../../../ui/ConfirmButton";
import Popover from "../../../ui/Popover";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import type { SubjectRef } from "../../../core/study/studyReadRepository";
import KindMark from "../components/KindMark";
import { getNoteRefs, type NoteRef } from "../../../core/notes/noteRefsRepository";
import ItemChip from "../components/ItemChip";
import LinkNoteButton from "../components/LinkNoteButton";
import { getEvent, listEventNoteLinks, listProperties } from "../data/calendarRepository";
import { linkNote, unlinkNote } from "../data/noteLinkOps";
import { onCalendarChanged } from "../data/calendarChanges";
import { changeFields, changeOccurrence, detachOccurrence, duplicate, toggleReminderDone } from "../data/occurrenceOps";
import { addDays, atMinutes, dayKey, minutesOfDay, parseDayKey, parseTime, startOfDay, timeText } from "../lib/dates";
import { longDate, repeatText } from "../lib/format";
import { colorName } from "../lib/palette";
import { occurrenceEnd, shiftInstant, wallDelta } from "../lib/recurrence";
import { isReminderDone } from "../lib/reminders";
import type { CalendarCategory, CalendarEvent, CalendarProperty, ItemKind, NoteLink, Occurrence } from "../lib/types";
import CategoryPicker from "./CategoryPicker";
import ColorPicker from "./ColorPicker";
import LinkedSessions from "./LinkedSessions";
import PropertyRows from "./PropertyRows";
import ReminderEditor from "./ReminderEditor";
import RepeatEditor from "./RepeatEditor";
import TodoList from "./TodoList";
import "../components/controls.css";
import "./EventPanel.css";

/*
 * Evento personalizzato (mockup: "Evento personalizzato"): pannello laterale con data, orario, ripeti, promemoria,
 * categoria, materia, proprietà personalizzate, cose da fare, sessioni di studio collegate, Duplica ed Elimina.
 * Ogni modifica si salva subito. Per un elemento che si ripete le modifiche valgono per tutta la serie;
 * "Modifica solo questa" stacca l'occorrenza e la apre come elemento a sé.
 */

export interface PanelTarget {
  eventId: number;
  /** L'occorrenza aperta (per le serie); null = l'inizio dell'elemento. */
  occStart: number | null;
}

interface EventPanelProps {
  target: PanelTarget;
  now: Date;
  subjects: SubjectRef[];
  subjectMap: ReadonlyMap<number, SubjectRef>;
  categories: CalendarCategory[];
  onClose: () => void;
  onOpenTarget: (target: PanelTarget) => void;
  onDelete: (occurrence: Occurrence) => void;
  onPlanSession: (parent: CalendarEvent, anchor: HTMLElement) => void;
  onOpenNote: (noteId: number) => void;
  onOpenTimer: (subjectId: number | null) => void;
}

const fail = (error: unknown) => console.error("Calendario: modifica non riuscita", error);

function EventPanel({ target, now, subjects, subjectMap, categories, onClose, onOpenTarget, onDelete, onPlanSession, onOpenNote, onOpenTimer }: EventPanelProps) {
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [properties, setProperties] = useState<CalendarProperty[]>([]);
  const [notes, setNotes] = useState<{ link: NoteLink; ref: NoteRef }[]>([]);
  const [version, setVersion] = useState(0);
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => onCalendarChanged(() => setVersion((v) => v + 1)), []);

  const closeRef = useLatestRef(onClose);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getEvent(target.eventId), listProperties(), listEventNoteLinks([target.eventId])])
      .then(async ([e, props, links]) => {
        const refs = new Map((await getNoteRefs(links.map((l) => l.noteId))).map((n) => [n.id, n]));
        if (cancelled) return;
        if (!e) return closeRef.current(); // eliminato (anche da un altro dispositivo)
        setEvent(e);
        setProperties(props);
        // le note cancellate o nel cestino non si mostrano
        setNotes(links.flatMap((link) => (refs.has(link.noteId) ? [{ link, ref: refs.get(link.noteId) as NoteRef }] : [])));
      })
      .catch(fail);
    return () => {
      cancelled = true;
    };
  }, [target.eventId, version, closeRef]);

  // Il focus entra nel pannello (Esc lo chiude, come gli altri dialoghi).
  useEffect(() => {
    panelRef.current?.focus();
  }, [target.eventId]);

  const content = event ? renderContent(event) : null;

  function renderContent(e: CalendarEvent) {
    const start = target.occStart ?? e.startAt;
    const end = occurrenceEnd(e, start);
    const occurrence: Occurrence = { event: e, start, end, key: `${e.id}:${start}`, recurring: e.repeat !== null };
    const set = (change: Parameters<typeof changeFields>[1]) => changeFields(e.id, change).catch(fail);
    const setTimes = (startAt: number, endAt: number) =>
      changeOccurrence(occurrence, { startAt, endAt }, "all")
        .then(() => {
          if (target.occStart !== null) onOpenTarget({ eventId: e.id, occStart: e.repeat ? startAt : null });
        })
        .catch(fail);

    const reminderDone = isReminderDone(occurrence);
    const startMin = Math.round(minutesOfDay(start));
    const endsNextDay = startOfDay(end).getTime() > startOfDay(start).getTime();
    const endMin = endsNextDay && minutesOfDay(end) === 0 ? 1440 : Math.round(minutesOfDay(end));
    const lastAllDay = addDays(end, -1);

    function setKind(kind: ItemKind) {
      if (kind === e.kind) return;
      if (kind === "reminder") {
        // un promemoria è un'ora sola: tiene l'inizio (le 9 se era "tutto il giorno"), niente fine
        const at = e.allDay ? atMinutes(startOfDay(start), 9 * 60) : start;
        changeOccurrence(occurrence, { kind, subjectId: null, allDay: false, startAt: at, endAt: at }, "all").catch(fail);
        return;
      }
      const subjectId = kind === "study" ? (e.subjectId ?? subjects[0]?.id ?? null) : null;
      if (e.kind === "reminder") {
        // da promemoria: un'ora a partire da lì
        changeOccurrence(occurrence, { kind, subjectId, startAt: start, endAt: start + 3_600_000 }, "all").catch(fail);
        return;
      }
      void set(kind === "study" ? { kind, subjectId } : { kind });
    }

    function commitTime(which: "start" | "end", text: string, input: HTMLInputElement) {
      const m = parseTime(text);
      const day = startOfDay(start);
      if (m === null || (which === "start" && m >= 1440)) {
        input.value = which === "start" ? timeText(startMin) : endMin >= 1440 ? "24:00" : timeText(endMin);
        return;
      }
      if (which === "start") {
        if (m === startMin) return;
        const startAt = atMinutes(day, m);
        void setTimes(startAt, startAt + (end - start)); // la durata resta uguale
      } else {
        if (m === endMin) return;
        if (m <= startMin) {
          input.value = endMin >= 1440 ? "24:00" : timeText(endMin);
          return;
        }
        void setTimes(start, atMinutes(day, m));
      }
    }

    const color = e.color ?? categories.find((c) => c.id === e.categoryId)?.color ?? null;
    const subject = e.subjectId === null ? undefined : subjectMap.get(e.subjectId);

    return (
      <>
        <div className="cal-panel-top">
          <button type="button" className="cal-panel-iconbtn" aria-label="Chiudi il pannello" onClick={onClose}>
            <MdKeyboardDoubleArrowRight aria-hidden="true" />
          </button>
          <div className="cal-panel-actions">
            <button
              type="button"
              className="cal-panel-textbtn"
              onClick={() =>
                duplicate(e.id)
                  .then((id) => id !== null && onOpenTarget({ eventId: id, occStart: null }))
                  .catch(fail)
              }
            >
              Duplica
            </button>
            {occurrence.recurring ? (
              // per una serie la conferma è la domanda "Solo questa / Tutte"
              <button type="button" className="cal-panel-textbtn cal-panel-textbtn--danger" onClick={() => onDelete(occurrence)}>
                Elimina
              </button>
            ) : (
              <ConfirmButton
                label="Elimina"
                confirmLabel="Sicuro? Clicca di nuovo"
                className="cal-panel-textbtn cal-panel-textbtn--danger"
                onConfirm={() => onDelete(occurrence)}
              />
            )}
          </div>
        </div>

        {occurrence.recurring && (
          <div className="cal-panel-banner">
            <span>
              {repeatText(e.repeat, e.startAt)}: le modifiche valgono per tutta la serie.
            </span>
            <button
              type="button"
              className="cal-panel-textbtn"
              onClick={() =>
                detachOccurrence(occurrence)
                  .then((id) => onOpenTarget({ eventId: id, occStart: null }))
                  .catch(fail)
              }
            >
              Modifica solo questa
            </button>
          </div>
        )}

        <div className="cal-panel-titlerow">
          {e.kind !== "study" ? (
            <button
              ref={colorRef}
              type="button"
              className="cal-panel-swatch"
              style={color ? ({ "--item": color } as CSSProperties) : undefined}
              aria-label={`Colore: ${colorName(e.color)}`}
              onClick={() => setColorOpen(true)}
            />
          ) : (
            <span className="cal-panel-swatch cal-panel-swatch--study" style={subject ? ({ "--item": subject.color } as CSSProperties) : undefined}>
              <KindMark kind="study" />
            </span>
          )}
          <input
            key={`${e.id}:${e.title}`}
            type="text"
            className="cal-panel-title"
            aria-label="Titolo"
            placeholder={e.kind === "study" ? (subject?.name ?? "Sessione di studio") : "Senza titolo"}
            maxLength={200}
            defaultValue={e.title}
            onBlur={(ev) => {
              const title = ev.target.value.trim();
              if (title !== e.title) void set({ title });
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") ev.currentTarget.blur();
            }}
          />
          {e.kind === "reminder" && (
            <button
              type="button"
              className={`cal-panel-check${reminderDone ? " cal-panel-check--on" : ""}`}
              aria-pressed={reminderDone}
              onClick={() => void toggleReminderDone(occurrence).catch(fail)}
            >
              <KindMark kind="reminder" filled={reminderDone} />
              {reminderDone ? "Fatto" : "Da fare"}
            </button>
          )}
          {colorOpen && (
            <Popover anchor={colorRef} onClose={() => setColorOpen(false)} className="cal-mini-pop" label="Colore">
              <ColorPicker
                value={e.color}
                allowNone
                onChange={(c) => {
                  setColorOpen(false);
                  void set({ color: c });
                }}
              />
            </Popover>
          )}
        </div>

        <div className="cal-panel-props">
          <div className="cal-panel-row">
            <span className="cal-panel-label">Tipo</span>
            <div className="cal-panel-cell">
              <div className="cal-seg cal-seg--small" role="group" aria-label="Tipo">
                {(["event", "study", "reminder"] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={e.kind === k} className={e.kind === k ? "active" : ""} onClick={() => setKind(k)}>
                    <KindMark kind={k} className="cal-seg-mark" />
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="cal-panel-row">
            <span className="cal-panel-label">Data</span>
            <div className="cal-panel-cell">
              <input
                type="date"
                className="cal-field cal-field--date"
                aria-label="Data"
                value={dayKey(start)}
                title={longDate(start, now)}
                onChange={(ev) => {
                  const d = parseDayKey(ev.target.value);
                  if (!d) return;
                  const { days } = wallDelta(startOfDay(start).getTime(), d.getTime());
                  if (days !== 0) void setTimes(shiftInstant(start, days, 0), shiftInstant(end, days, 0));
                }}
              />
            </div>
          </div>

          <div className="cal-panel-row">
            <span className="cal-panel-label">{e.kind === "reminder" ? "Ora" : "Orario"}</span>
            <div className="cal-panel-cell cal-panel-times">
              {e.kind === "reminder" ? (
                <input
                  key={`s${start}`}
                  type="text"
                  inputMode="numeric"
                  className="cal-field cal-field--time"
                  aria-label="Ora"
                  defaultValue={timeText(startMin)}
                  onBlur={(ev) => commitTime("start", ev.target.value, ev.target)}
                  onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
                />
              ) : e.allDay ? (
                <label className="cal-panel-inline">
                  fino al
                  <input
                    type="date"
                    className="cal-field cal-field--date"
                    aria-label="Ultimo giorno"
                    value={dayKey(lastAllDay)}
                    min={dayKey(start)}
                    onChange={(ev) => {
                      const d = parseDayKey(ev.target.value);
                      if (d && d.getTime() >= startOfDay(start).getTime()) void setTimes(startOfDay(start).getTime(), addDays(d, 1).getTime());
                    }}
                  />
                </label>
              ) : (
                <>
                  <input
                    key={`s${start}`}
                    type="text"
                    inputMode="numeric"
                    className="cal-field cal-field--time"
                    aria-label="Inizio"
                    defaultValue={timeText(startMin)}
                    onBlur={(ev) => commitTime("start", ev.target.value, ev.target)}
                    onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
                  />
                  <span aria-hidden="true">–</span>
                  <input
                    key={`e${end}`}
                    type="text"
                    inputMode="numeric"
                    className="cal-field cal-field--time"
                    aria-label="Fine"
                    defaultValue={endMin >= 1440 ? "24:00" : timeText(endMin)}
                    onBlur={(ev) => commitTime("end", ev.target.value, ev.target)}
                    onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
                  />
                </>
              )}
              {e.kind !== "reminder" && (
                <label className="cal-panel-inline cal-panel-allday">
                  <input
                    type="checkbox"
                    checked={e.allDay}
                    onChange={(ev) => {
                      const day = startOfDay(start);
                      if (ev.target.checked) {
                        changeOccurrence(occurrence, { allDay: true, startAt: day.getTime(), endAt: addDays(day, 1).getTime() }, "all").catch(fail);
                      } else {
                        const s = atMinutes(day, 9 * 60);
                        changeOccurrence(occurrence, { allDay: false, startAt: s, endAt: s + 3_600_000 }, "all").catch(fail);
                      }
                    }}
                  />
                  Tutto il giorno
                </label>
              )}
            </div>
          </div>

          <div className="cal-panel-row cal-panel-row--top">
            <span className="cal-panel-label">Ripeti</span>
            <div className="cal-panel-cell">
              <RepeatEditor rule={e.repeat} start={e.startAt} onChange={(repeat) => void set({ repeat })} />
            </div>
          </div>

          <div className="cal-panel-row">
            <span className="cal-panel-label">{e.kind === "reminder" ? "Avvisi prima" : "Promemoria"}</span>
            <div className="cal-panel-cell">
              <ReminderEditor reminders={e.reminders} onChange={(reminders) => void set({ reminders })} />
            </div>
          </div>

          {e.kind !== "study" && (
            <div className="cal-panel-row">
              <span className="cal-panel-label">Categoria</span>
              <div className="cal-panel-cell">
                <CategoryPicker value={e.categoryId} categories={categories} onChange={(categoryId) => void set({ categoryId })} />
              </div>
            </div>
          )}

          {e.kind === "reminder" && (
            <div className="cal-panel-row cal-panel-row--top">
              <span className="cal-panel-label">Descrizione</span>
              <div className="cal-panel-cell">
                <textarea
                  key={`${e.id}:d:${e.description}`}
                  className="cal-field cal-panel-desc"
                  aria-label="Descrizione"
                  placeholder="Aggiungi una descrizione"
                  rows={3}
                  maxLength={2000}
                  defaultValue={e.description}
                  onBlur={(ev) => {
                    const description = ev.target.value.trim();
                    if (description !== e.description) void set({ description });
                  }}
                />
              </div>
            </div>
          )}

          {e.kind !== "reminder" && (
            <div className="cal-panel-row">
              <span className="cal-panel-label">Materia</span>
              <div className="cal-panel-cell">
                <select
                  className="cal-field cal-field--select"
                  aria-label="Materia"
                  value={e.subjectId ?? ""}
                  style={subject ? ({ "--item": subject.color } as CSSProperties) : undefined}
                  onChange={(ev) => void set({ subjectId: ev.target.value === "" ? null : Number(ev.target.value) })}
                >
                  {e.kind === "event" && <option value="">Nessuna</option>}
                  {e.kind === "study" && e.subjectId === null && <option value="">Scegli…</option>}
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="cal-panel-row">
            <span className="cal-panel-label">Note collegate</span>
            <div className="cal-panel-cell">
              {notes.map(({ link, ref }) => (
                <span key={link.id} className="cal-panel-note">
                  <ItemChip kind="note" label={ref.title || "Nota senza titolo"} onClick={() => onOpenNote(ref.id)} />
                  <button
                    type="button"
                    className="cal-mini-remove"
                    aria-label={`Scollega la nota ${ref.title || "senza titolo"}`}
                    onClick={() => void unlinkNote(link.id).catch(fail)}
                  >
                    <MdClose aria-hidden="true" />
                  </button>
                </span>
              ))}
              <LinkNoteButton
                label={notes.length === 0 ? "+ Collega una nota" : "+"}
                ariaLabel={notes.length === 0 ? undefined : "Collega un'altra nota"}
                className="cal-panel-add"
                exclude={notes.map((n) => n.ref.id)}
                onPick={(note) => void linkNote(note.id, { day: null, eventId: e.id }).catch(fail)}
              />
            </div>
          </div>

          <PropertyRows properties={properties} values={e.props} onChange={(uid, value) => void set({ props: { ...e.props, [uid]: value } })} />
        </div>

        {e.kind !== "reminder" && (
          <>
            <div className="cal-panel-divider" />
            <TodoList key={e.id} todos={e.todos} onChange={(todos) => void set({ todos })} />
          </>
        )}

        {e.kind === "event" && (
          <>
            <div className="cal-panel-divider" />
            <LinkedSessions
              eventId={e.id}
              subjects={subjectMap}
              now={now.getTime()}
              onOpen={(s) => onOpenTarget({ eventId: s.id, occStart: null })}
              onPlan={(anchor) => onPlanSession(e, anchor)}
            />
          </>
        )}

        <div className="cal-panel-foot">
          {e.kind === "study" && (
            <button type="button" className="cal-btn-ghost" onClick={() => onOpenTimer(e.subjectId)}>
              Apri il timer
            </button>
          )}
          <button type="button" className="cal-btn-primary" onClick={onClose}>
            Fatto
          </button>
        </div>
      </>
    );
  }

  return createPortal(
    <>
      <div className="cal-panel-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        className="cal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={event ? event.title || "Elemento del calendario" : "Elemento del calendario"}
        tabIndex={-1}
        onKeyDown={(ev) => {
          // solo il suo Esc: quello di un menu aperto sopra (in un altro portale) lo chiude quel menu
          if (ev.key === "Escape" && panelRef.current?.contains(ev.target as Node)) {
            ev.stopPropagation();
            onClose();
          }
        }}
      >
        {content ?? <p className="cal-loading">Caricamento…</p>}
      </div>
    </>,
    document.body
  );
}

const KIND_LABEL: Record<ItemKind, string> = { event: "Evento", study: "Studio", reminder: "Promemoria" };

export default EventPanel;
