import { useRef, useState } from "react";
import { MdClose } from "react-icons/md";
import Popover from "../../../ui/Popover";
import { parseTime, timeText } from "../lib/dates";
import { reminderLabel } from "../lib/reminders";
import type { Reminder } from "../lib/types";

/* "Promemoria" del pannello: chip con ×, e "+" che apre la scelta (minuti prima, o alle HH:MM del giorno o prima). */

interface ReminderEditorProps {
  reminders: Reminder[];
  onChange: (reminders: Reminder[]) => void;
}

type Choice = { kind: "offset"; minutes: number } | { kind: "at"; days: number };

const CHOICES: { label: string; value: Choice }[] = [
  { label: "All'inizio", value: { kind: "offset", minutes: 0 } },
  { label: "10 minuti prima", value: { kind: "offset", minutes: 10 } },
  { label: "30 minuti prima", value: { kind: "offset", minutes: 30 } },
  { label: "1 ora prima", value: { kind: "offset", minutes: 60 } },
  { label: "Lo stesso giorno alle…", value: { kind: "at", days: 0 } },
  { label: "Il giorno prima alle…", value: { kind: "at", days: 1 } },
  { label: "2 giorni prima alle…", value: { kind: "at", days: 2 } },
];

function same(a: Reminder, b: Reminder): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ReminderEditor({ reminders, onChange }: ReminderEditorProps) {
  const addRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(0);
  const [time, setTime] = useState("20:00");

  const picked = CHOICES[choice].value;
  const minutes = parseTime(time);
  const valid = picked.kind === "offset" || (minutes !== null && minutes < 1440);

  function add() {
    if (!valid) return;
    const r: Reminder = picked.kind === "offset" ? { type: "offset", minutes: picked.minutes } : { type: "at", days: picked.days, time: timeText(minutes as number) };
    if (!reminders.some((x) => same(x, r))) onChange([...reminders, r]);
    setOpen(false);
  }

  return (
    <div className="cal-panel-chips">
      {reminders.map((r, i) => (
        <span key={i} className="cal-panel-tag">
          {reminderLabel(r)}
          <button type="button" aria-label={`Togli il promemoria ${reminderLabel(r)}`} onClick={() => onChange(reminders.filter((_, j) => j !== i))}>
            <MdClose aria-hidden="true" />
          </button>
        </span>
      ))}
      <button ref={addRef} type="button" className="cal-panel-add" aria-label="Aggiungi un promemoria" onClick={() => setOpen(true)}>
        {reminders.length === 0 ? "+ Aggiungi" : "+"}
      </button>
      {open && (
        <Popover anchor={addRef} onClose={() => setOpen(false)} className="cal-mini-pop" label="Nuovo promemoria">
          <form
            className="cal-mini-form"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <select className="cal-field cal-field--select" aria-label="Quando" value={choice} autoFocus onChange={(e) => setChoice(Number(e.target.value))}>
              {CHOICES.map((c, i) => (
                <option key={c.label} value={i}>
                  {c.label}
                </option>
              ))}
            </select>
            {picked.kind === "at" && (
              <input
                type="text"
                inputMode="numeric"
                className="cal-field cal-field--time"
                aria-label="Ora"
                aria-invalid={!valid}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            )}
            <button type="submit" className="cal-btn-primary" disabled={!valid}>
              Aggiungi
            </button>
          </form>
        </Popover>
      )}
    </div>
  );
}

export default ReminderEditor;
