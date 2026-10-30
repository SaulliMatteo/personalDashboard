import { useRef, useState } from "react";
import { MdAdd, MdCheck } from "react-icons/md";
import { choiceOf, type CellValue, type Field } from "../lib/collections";
import { addChoice } from "../lib/collectionsStore";
import ChoiceChip from "./ChoiceChip";
import Popover from "./Popover";
import "./ChoicePicker.css";

interface ChoicePickerProps {
  field: Field;
  /** Scelta (select): un id o null. Scelte multiple: un elenco di id. */
  value: CellValue;
  onChange: (value: CellValue) => void;
  onNotice: (message: string) => void;
}

/**
 * Cella di un campo Scelta o Scelte multiple: un clic apre l'elenco; si scrive per cercare,
 * e se la scelta non c'è ancora la si crea (Invio). Scelta = una sola, Scelte multiple = quante si vuole.
 */
function ChoicePicker({ field, value, onChange, onNotice }: ChoicePickerProps) {
  const multi = field.type === "multi";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const anchor = useRef<HTMLButtonElement | null>(null);
  const choices = field.options.choices ?? [];
  const selected = multi ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : [];
  const q = query.trim().toLowerCase();
  const shown = q ? choices.filter((c) => c.label.toLowerCase().includes(q)) : choices;
  const exact = choices.find((c) => c.label.trim().toLowerCase() === q);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function toggle(id: string) {
    if (multi) onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else {
      onChange(selected.includes(id) ? null : id);
      close();
    }
  }

  async function create() {
    const label = query.trim();
    if (!label) return;
    try {
      const id = await addChoice(field.id, label);
      setQuery("");
      if (multi) onChange(selected.includes(id) ? selected : [...selected, id]);
      else {
        onChange(id);
        close();
      }
    } catch (error) {
      console.error("Scelta non creata:", error);
      onNotice("Impossibile creare la scelta");
    }
  }

  const chips = selected.flatMap((id) => {
    const c = choiceOf(field, id);
    return c ? [c] : [];
  });

  return (
    <span className="nq-pick">
      <button
        ref={anchor}
        type="button"
        className={`nq-pick-btn${chips.length === 0 ? " is-empty" : ""}`}
        aria-label={`${field.name}: ${chips.map((c) => c.label).join(", ") || "nessuna scelta"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {chips.map((c) => (
          <ChoiceChip key={c.id} label={c.label} color={c.color} />
        ))}
        {chips.length === 0 && <span className="nq-pick-ph">{multi ? "Aggiungi" : "Scegli"}</span>}
        {multi && chips.length > 0 && <MdAdd className="nq-pick-plus" aria-hidden="true" />}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={close} className="nq-pick-pop" label={field.name}>
          <input
            className="nq-pick-search"
            autoFocus
            value={query}
            placeholder={choices.length === 0 ? "Scrivi la prima scelta…" : "Cerca o crea una scelta"}
            aria-label="Cerca o crea una scelta"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (exact) toggle(exact.id);
              else void create();
            }}
          />
          <p className="nq-pick-hint">{multi ? "Puoi sceglierne più d'una." : "Se ne sceglie una sola."}</p>
          <div className="nq-pick-list" role="listbox" aria-multiselectable={multi} aria-label="Scelte">
            {shown.map((c) => {
              const on = selected.includes(c.id);
              return (
                <button key={c.id} type="button" role="option" aria-selected={on} className="nq-pick-opt" onClick={() => toggle(c.id)}>
                  <span className="nq-pick-mark" aria-hidden="true">
                    {on && <MdCheck />}
                  </span>
                  <ChoiceChip label={c.label} color={c.color} />
                </button>
              );
            })}
          </div>
          {q && !exact && (
            <button type="button" className="nq-pick-create" onClick={() => void create()}>
              <MdAdd aria-hidden="true" /> Crea «{query.trim()}»
            </button>
          )}
          {!multi && selected.length > 0 && (
            <button
              type="button"
              className="nq-pick-clear"
              onClick={() => {
                onChange(null);
                close();
              }}
            >
              Togli la scelta
            </button>
          )}
        </Popover>
      )}
    </span>
  );
}

export default ChoicePicker;
