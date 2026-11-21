import { useRef, useState, type RefObject } from "react";
import { MdOpenInNew } from "react-icons/md";
import Popover from "../../../ui/Popover";
import { createProperty, deleteProperty, updateProperty } from "../data/calendarRepository";
import { notifyCalendarChanged } from "../data/calendarChanges";
import { openExternalLink } from "../data/linkApi";
import { PROP_TYPES, PROP_TYPE_LABEL } from "../lib/serialize";
import type { CalendarProperty, PropType, PropValue } from "../lib/types";

/*
 * Proprietà personalizzate (stile Notion): una riga per proprietà, comune a tutti gli eventi; il valore è
 * dell'evento (props[uid]). Il nome della proprietà apre la sua modifica (nome, tipo, scelte, elimina).
 */

interface PropertyRowsProps {
  properties: CalendarProperty[];
  values: Record<string, PropValue>;
  onChange: (uid: string, value: PropValue) => void;
}

function safeLink(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  return /^(https?|mailto):/i.test(withScheme) ? withScheme : null;
}

function PropertyValue({ property, value, onChange }: { property: CalendarProperty; value: PropValue; onChange: (v: PropValue) => void }) {
  const label = property.name;
  switch (property.type) {
    case "checkbox":
      return (
        <input
          type="checkbox"
          className="cal-panel-check"
          aria-label={label}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className="cal-field"
          aria-label={label}
          placeholder="Vuoto"
          defaultValue={typeof value === "number" ? value : ""}
          onBlur={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "date":
      return (
        <input
          type="date"
          className="cal-field cal-field--date"
          aria-label={label}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "select":
      return (
        <select className="cal-field cal-field--select" aria-label={label} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Vuoto</option>
          {property.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "link": {
      const href = typeof value === "string" ? safeLink(value) : null;
      return (
        <span className="cal-panel-link">
          <input
            type="url"
            className="cal-field"
            aria-label={label}
            placeholder="Vuoto"
            defaultValue={typeof value === "string" ? value : ""}
            onBlur={(e) => onChange(e.target.value.trim() || null)}
          />
          {href && (
            // nel browser di sistema, mai nella finestra dell'app
            <button
              type="button"
              aria-label={`Apri ${href}`}
              title="Apri il link"
              className="cal-panel-open"
              onClick={() => void openExternalLink(href).catch((error) => console.error("Calendario: link non aperto", error))}
            >
              <MdOpenInNew aria-hidden="true" />
            </button>
          )}
        </span>
      );
    }
    default:
      return (
        <input
          type="text"
          className="cal-field"
          aria-label={label}
          placeholder="Vuoto"
          defaultValue={typeof value === "string" ? value : ""}
          onBlur={(e) => onChange(e.target.value.trim() || null)}
        />
      );
  }
}

/** Modifica di una proprietà: nome, tipo, scelte (per "Selezione"), elimina. */
function PropertyMenu({ property, anchor, onClose }: { property: CalendarProperty; anchor: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const [name, setName] = useState(property.name);
  const [type, setType] = useState<PropType>(property.type);
  const [options, setOptions] = useState(property.options.join(", "));

  async function save() {
    await updateProperty(property.id, {
      name: name.trim() || property.name,
      type,
      options: options
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    });
    notifyCalendarChanged();
    onClose();
  }

  return (
    <Popover anchor={anchor} onClose={onClose} className="cal-mini-pop" label={`Proprietà ${property.name}`}>
      <form
        className="cal-mini-form cal-mini-form--column"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input type="text" className="cal-field" aria-label="Nome" maxLength={40} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        <select className="cal-field cal-field--select" aria-label="Tipo" value={type} onChange={(e) => setType(e.target.value as PropType)}>
          {PROP_TYPES.map((t) => (
            <option key={t} value={t}>
              {PROP_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        {type === "select" && (
          <input
            type="text"
            className="cal-field"
            aria-label="Scelte, separate da virgole"
            placeholder="Scelte, separate da virgole"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
          />
        )}
        <div className="cal-mini-actions">
          <button
            type="button"
            className="cal-btn-ghost cal-btn-danger"
            onClick={async () => {
              await deleteProperty(property.id);
              notifyCalendarChanged();
              onClose();
            }}
          >
            Elimina
          </button>
          <button type="submit" className="cal-btn-primary">
            Salva
          </button>
        </div>
      </form>
    </Popover>
  );
}

function PropertyRow({ property, value, onChange }: { property: CalendarProperty; value: PropValue; onChange: (v: PropValue) => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="cal-panel-row">
      <button ref={ref} type="button" className="cal-panel-label cal-panel-label--btn" title="Modifica la proprietà" onClick={() => setOpen(true)}>
        {property.name}
      </button>
      <div className="cal-panel-cell">
        {/* key: un valore cambiato da fuori (sync, altra finestra) ricrea i campi non controllati */}
        <PropertyValue key={`${property.id}:${property.type}:${String(value)}`} property={property} value={value} onChange={onChange} />
      </div>
      {open && <PropertyMenu property={property} anchor={ref} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** "+ Aggiungi una proprietà": nome e tipo. */
function AddProperty() {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<PropType>("text");

  async function add() {
    const n = name.trim();
    if (!n) return;
    await createProperty(n, type);
    notifyCalendarChanged();
    setName("");
    setOpen(false);
  }

  return (
    <div className="cal-panel-addprop">
      <button ref={ref} type="button" className="cal-panel-add" onClick={() => setOpen(true)}>
        + Aggiungi una proprietà
      </button>
      <span>{PROP_TYPES.map((t) => PROP_TYPE_LABEL[t]).join(" · ")}</span>
      {open && (
        <Popover anchor={ref} onClose={() => setOpen(false)} className="cal-mini-pop" label="Nuova proprietà">
          <form
            className="cal-mini-form cal-mini-form--column"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input type="text" className="cal-field" placeholder="Nome" aria-label="Nome" maxLength={40} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
            <select className="cal-field cal-field--select" aria-label="Tipo" value={type} onChange={(e) => setType(e.target.value as PropType)}>
              {PROP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROP_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <button type="submit" className="cal-btn-primary" disabled={!name.trim()}>
              Aggiungi
            </button>
          </form>
        </Popover>
      )}
    </div>
  );
}

function PropertyRows({ properties, values, onChange }: PropertyRowsProps) {
  return (
    <>
      {properties.map((p) => (
        <PropertyRow key={p.id} property={p} value={values[p.uid] ?? null} onChange={(v) => onChange(p.uid, v)} />
      ))}
      <AddProperty />
    </>
  );
}

export default PropertyRows;
