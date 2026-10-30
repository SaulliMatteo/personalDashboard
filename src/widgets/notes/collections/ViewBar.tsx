import { useState } from "react";
import { MdAdd, MdArrowDownward, MdArrowUpward, MdClose } from "react-icons/md";
import {
  OP_LABELS,
  groupableFields,
  opNeedsValue,
  opsFor,
  choiceOf,
  formatDate,
  type Field,
  type Filter,
  type FilterOp,
  type View,
  type ValueContext,
} from "../lib/collections";
import "./ViewBar.css";

interface ViewBarProps {
  view: View;
  fields: Field[];
  ctx: ValueContext;
  onChange: (patch: Partial<Pick<View, "filter" | "sort" | "groupField">>) => void;
}

/** Testo del chip di un filtro: "Stato è In corso". */
function filterLabel(f: Filter, field: Field | undefined, ctx: ValueContext): string {
  if (!field) return "Campo tolto";
  const op = OP_LABELS[f.op];
  if (!opNeedsValue(f.op)) return `${field.name} ${op}`;
  let value = f.value ?? "";
  if (field.type === "select" || field.type === "multi") value = choiceOf(field, value)?.label ?? "…";
  else if (field.type === "date" && value) value = formatDate(value, ctx.now);
  return `${field.name} ${op} ${value || "…"}`;
}

/** Il valore di un filtro: lista delle scelte, data, numero o testo. */
function FilterValue({ field, filter, onChange }: { field: Field; filter: Filter; onChange: (value: string) => void }) {
  if (field.type === "select" || field.type === "multi") {
    return (
      <select aria-label="Valore" value={filter.value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Scegli…</option>
        {(field.options.choices ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.label || "Senza nome"}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      aria-label="Valore"
      type={field.type === "date" ? "date" : "text"}
      inputMode={field.type === "number" ? "decimal" : undefined}
      value={filter.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Sopra la vista: ordinamento, filtri ("+ Filtro") e, in bacheca, il campo delle colonne. */
function ViewBar({ view, fields, ctx, onChange }: ViewBarProps) {
  const [open, setOpen] = useState<"sort" | number | null>(null);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const sortField = view.sort ? byId.get(view.sort.field) : undefined;

  function setFilter(i: number, patch: Partial<Filter>) {
    onChange({ filter: view.filter.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  }

  function addFilter() {
    const field = fields[0];
    if (!field) return;
    onChange({ filter: [...view.filter, { field: field.id, op: opsFor(field.type)[0] }] });
    setOpen(view.filter.length);
  }

  const close = () => setOpen(null);
  const groupable = groupableFields(fields);

  return (
    <div className="nq-vbar">
      <span className="nq-vbar-anchor">
        <button type="button" className={`nq-vchip${sortField ? " is-on" : ""}`} aria-expanded={open === "sort"} onClick={() => setOpen(open === "sort" ? null : "sort")}>
          {sortField ? (
            <>
              Ordina per {sortField.name} {view.sort?.dir === 1 ? <MdArrowUpward aria-label="crescente" /> : <MdArrowDownward aria-label="decrescente" />}
            </>
          ) : (
            "Ordina"
          )}
        </button>
        {open === "sort" && (
          <>
            <div className="nq-vbar-backdrop" onClick={close} />
            <div className="nq-vpop" role="dialog" aria-label="Ordinamento">
              <select
                aria-label="Campo"
                value={view.sort?.field ?? ""}
                onChange={(e) => onChange({ sort: e.target.value ? { field: Number(e.target.value), dir: view.sort?.dir ?? 1 } : null })}
              >
                <option value="">Ordine di inserimento</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              {view.sort && (
                <div className="nq-vpop-seg" role="group" aria-label="Verso">
                  <button type="button" aria-pressed={view.sort.dir === 1} onClick={() => view.sort && onChange({ sort: { ...view.sort, dir: 1 } })}>
                    <MdArrowUpward aria-hidden="true" /> Crescente
                  </button>
                  <button type="button" aria-pressed={view.sort.dir === -1} onClick={() => view.sort && onChange({ sort: { ...view.sort, dir: -1 } })}>
                    <MdArrowDownward aria-hidden="true" /> Decrescente
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </span>

      {view.filter.map((f, i) => {
        const field = byId.get(f.field);
        return (
          <span key={i} className="nq-vbar-anchor">
            <span className="nq-vchip is-on">
              <button type="button" className="nq-vchip-main" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {filterLabel(f, field, ctx)}
              </button>
              <button
                type="button"
                className="nq-vchip-x"
                aria-label="Togli il filtro"
                onClick={() => {
                  close();
                  onChange({ filter: view.filter.filter((_, j) => j !== i) });
                }}
              >
                <MdClose />
              </button>
            </span>
            {open === i && (
              <>
                <div className="nq-vbar-backdrop" onClick={close} />
                <div className="nq-vpop" role="dialog" aria-label="Filtro">
                  <select
                    aria-label="Campo"
                    value={f.field}
                    onChange={(e) => {
                      const next = byId.get(Number(e.target.value));
                      if (next) setFilter(i, { field: next.id, op: opsFor(next.type)[0], value: undefined });
                    }}
                  >
                    {fields.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  {field && (
                    <select aria-label="Condizione" value={f.op} onChange={(e) => setFilter(i, { op: e.target.value as FilterOp })}>
                      {opsFor(field.type).map((op) => (
                        <option key={op} value={op}>
                          {OP_LABELS[op]}
                        </option>
                      ))}
                    </select>
                  )}
                  {field && opNeedsValue(f.op) && <FilterValue field={field} filter={f} onChange={(value) => setFilter(i, { value })} />}
                </div>
              </>
            )}
          </span>
        );
      })}

      <button type="button" className="nq-vchip nq-vchip--add" onClick={addFilter} disabled={fields.length === 0}>
        <MdAdd aria-hidden="true" /> Filtro
      </button>

      {view.layout === "bacheca" && (
        <label className="nq-vbar-group">
          <span>Colonne per</span>
          <select value={view.groupField ?? ""} onChange={(e) => onChange({ groupField: e.target.value ? Number(e.target.value) : null })}>
            {groupable.length === 0 && <option value="">Nessun campo Scelta o Data</option>}
            {groupable.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.type === "date" ? " (per settimana)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export default ViewBar;
