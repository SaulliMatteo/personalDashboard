import { useState, type CSSProperties, type FormEvent, type RefObject } from "react";
import { MdArrowForward, MdClose } from "react-icons/md";
import Popover from "../../../ui/Popover";
import type { SubjectRef } from "../../../core/study/studyReadRepository";
import { addDays, atMinutes, durationText, parseTime, startOfDay, timeText } from "../lib/dates";
import { longDate } from "../lib/format";
import type { ItemKind } from "../lib/types";
import KindMark from "./KindMark";
import "./controls.css";
import "./QuickEventPopover.css";

/*
 * Evento rapido (mockup: "Evento rapido"): titolo, tipo, materia se è studio, inizio–fine, "Tutto il giorno".
 * Promemoria: titolo, descrizione e una sola ora.
 * Invio salva, Esc chiude. Non scrive nulla: consegna la bozza a chi l'ha aperto (che sa se è nuovo o una serie).
 */

export interface QuickDraft {
  kind: ItemKind;
  title: string;
  subjectId: number | null;
  allDay: boolean;
  startAt: number;
  endAt: number;
  description: string;
}

interface QuickEventPopoverProps {
  anchor: RefObject<HTMLElement | null>;
  /** Il giorno e gli orari di partenza (minuti dalla mezzanotte). */
  day: Date;
  initial: { kind: ItemKind; title: string; subjectId: number | null; allDay: boolean; startMin: number; endMin: number };
  subjects: readonly SubjectRef[];
  now: Date;
  onSave: (draft: QuickDraft) => void;
  /** "Personalizza": salva e apre il pannello completo. */
  onCustomize: (draft: QuickDraft) => void;
  onClose: () => void;
}

function QuickEventPopover({ anchor, day, initial, subjects, now, onSave, onCustomize, onClose }: QuickEventPopoverProps) {
  const [kind, setKind] = useState<ItemKind>(initial.kind);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState<number | null>(initial.subjectId ?? subjects[0]?.id ?? null);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [startText, setStartText] = useState(timeText(initial.startMin));
  const [endText, setEndText] = useState(endLabel(initial.endMin));

  const startMin = parseTime(startText);
  const endMin = parseTime(endText);
  const isReminder = kind === "reminder";
  const timesValid = isReminder
    ? startMin !== null && startMin < 1440
    : allDay || (startMin !== null && endMin !== null && endMin > startMin);
  const subjectMissing = kind === "study" && subjectId === null;
  const canSave = timesValid && !subjectMissing && (kind === "study" || title.trim() !== "");

  // Cambiando l'inizio la fine si sposta con lui (la durata resta uguale, come nei calendari).
  const [committedStart, setCommittedStart] = useState(initial.startMin);
  function commitStart() {
    const next = parseTime(startText);
    if (next === null || next >= 1440) {
      setStartText(timeText(committedStart));
      return;
    }
    setStartText(timeText(next));
    if (endMin !== null) setEndText(endLabel(Math.min(endMin + (next - committedStart), 1440)));
    setCommittedStart(next);
  }

  function draft(): QuickDraft {
    const dayStart = startOfDay(day);
    if (isReminder) {
      // un promemoria è un istante: niente fine né "tutto il giorno"
      const at = atMinutes(dayStart, startMin as number);
      return { kind, title: title.trim(), subjectId: null, allDay: false, startAt: at, endAt: at, description: description.trim() };
    }
    return {
      kind,
      title: title.trim(),
      subjectId: kind === "study" ? subjectId : null,
      allDay,
      startAt: allDay ? dayStart.getTime() : atMinutes(dayStart, startMin as number),
      endAt: allDay ? addDays(dayStart, 1).getTime() : atMinutes(dayStart, endMin as number),
      description: "",
    };
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (canSave) onSave(draft());
  }

  return (
    <Popover anchor={anchor} onClose={onClose} className="cal-quick" label="Nuovo elemento">
      <form className="cal-quick-form" onSubmit={submit}>
        <div className="cal-quick-head">
          <span>{longDate(day, now)}</span>
          <button type="button" className="cal-quick-close" aria-label="Chiudi" onClick={onClose}>
            <MdClose aria-hidden="true" />
          </button>
        </div>

        <input
          className="cal-quick-title"
          type="text"
          aria-label="Titolo"
          placeholder={kind === "study" ? "Titolo (facoltativo)" : "Titolo"}
          value={title}
          maxLength={200}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="cal-seg" role="group" aria-label="Tipo">
          {(["event", "study", "reminder"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>
              <KindMark kind={k} className="cal-seg-mark" />
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {isReminder && (
          <textarea
            className="cal-quick-desc"
            aria-label="Descrizione"
            placeholder="Descrizione (facoltativa)"
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              // Invio salva anche da qui; Maiusc+Invio va a capo
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        )}

        {kind === "study" &&
          (subjects.length === 0 ? (
            <p className="cal-quick-hint">Nessuna materia: creane una nello Studio.</p>
          ) : (
            <div className="cal-quick-subjects" role="group" aria-label="Materia">
              {subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={subjectId === s.id}
                  className={subjectId === s.id ? "active" : ""}
                  style={{ "--item": s.color } as CSSProperties}
                  onClick={() => setSubjectId(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ))}

        {isReminder ? (
          <div className="cal-quick-times">
            <label className="cal-quick-at">
              Alle
              <input
                type="text"
                inputMode="numeric"
                aria-label="Ora"
                aria-invalid={!timesValid}
                className="cal-quick-time"
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                onBlur={() => {
                  const v = parseTime(startText);
                  if (v !== null && v < 1440) setStartText(timeText(v));
                }}
              />
            </label>
            {!timesValid && <span className="cal-quick-duration">Orario non valido</span>}
          </div>
        ) : (
          <div className="cal-quick-times">
            <input
              type="text"
              inputMode="numeric"
              aria-label="Inizio"
              className="cal-quick-time"
              value={allDay ? "" : startText}
              disabled={allDay}
              onChange={(e) => setStartText(e.target.value)}
              onBlur={commitStart}
            />
            <MdArrowForward className="cal-quick-arrow" aria-hidden="true" />
            <input
              type="text"
              inputMode="numeric"
              aria-label="Fine"
              aria-invalid={!allDay && !timesValid}
              className="cal-quick-time"
              value={allDay ? "" : endText}
              disabled={allDay}
              onChange={(e) => setEndText(e.target.value)}
              onBlur={() => {
                const v = parseTime(endText);
                if (v !== null) setEndText(endLabel(v));
              }}
            />
            <span className="cal-quick-duration">
              {allDay ? "" : timesValid && startMin !== null && endMin !== null ? durationText((endMin - startMin) * 60) : "Orario non valido"}
            </span>
            <label className="cal-quick-allday">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              Tutto il giorno
            </label>
          </div>
        )}

        <div className="cal-quick-foot">
          <button type="button" className="cal-btn-ghost" disabled={!timesValid || subjectMissing} onClick={() => onCustomize(draft())}>
            Personalizza
            <MdArrowForward aria-hidden="true" />
          </button>
          <div className="cal-quick-save">
            <span>Invio per salvare</span>
            <button type="submit" className="cal-btn-primary" disabled={!canSave}>
              Salva
            </button>
          </div>
        </div>
      </form>
    </Popover>
  );
}

const KIND_LABEL: Record<ItemKind, string> = { event: "Evento", study: "Studio", reminder: "Promemoria" };

/** La fine a mezzanotte si scrive "24:00" (00:00 sarebbe prima dell'inizio). */
function endLabel(minutes: number): string {
  return minutes >= 1440 ? "24:00" : timeText(minutes);
}

export default QuickEventPopover;
