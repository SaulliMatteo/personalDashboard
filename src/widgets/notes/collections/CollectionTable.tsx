import { useState } from "react";
import { MdAdd, MdDeleteOutline, MdOpenInFull } from "react-icons/md";
import { FIELD_TYPES, type CellValue, type Field, type FieldType, type Row, type ValueContext } from "../lib/collections";
import CellEditor, { type NoteRef } from "./CellEditor";
import FieldMenu from "./FieldMenu";
import FieldIcon from "./FieldIcon";
import "./CollectionTable.css";

interface CollectionTableProps {
  fields: Field[];
  rows: Row[];
  notes: NoteRef[];
  ctx: ValueContext;
  onCell: (row: Row, field: Field, value: CellValue) => void;
  onAddRow: () => void;
  onAddField: (type: FieldType) => void;
  onOpenRow: (row: Row) => void;
  onDeleteRow: (row: Row) => void;
  onOpenNote: (id: number) => void;
  onNotice: (message: string) => void;
}

/** Vista "Tabella": ogni cella si modifica sul posto; il menu di un campo si apre dall'intestazione. */
function CollectionTable({ fields, rows, notes, ctx, onCell, onAddRow, onAddField, onOpenRow, onDeleteRow, onOpenNote, onNotice }: CollectionTableProps) {
  const [fieldMenu, setFieldMenu] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="nq-ctable-wrap">
      <table className="nq-ctable">
        <thead>
          <tr>
            {fields.map((f, i) => (
              <th key={f.id} className={f.type === "number" ? "is-num" : undefined}>
                <span className="nq-ctable-anchor">
                  <button
                    type="button"
                    className="nq-ctable-field"
                    aria-haspopup="dialog"
                    aria-expanded={fieldMenu === f.id}
                    title="Modifica il campo"
                    onClick={() => setFieldMenu(fieldMenu === f.id ? null : f.id)}
                  >
                    <FieldIcon type={f.type} /> {f.name}
                  </button>
                  {fieldMenu === f.id && (
                    <FieldMenu
                      key={`${f.id}-${f.type}`}
                      field={f}
                      isFirst={i === 0}
                      isLast={i === fields.length - 1}
                      canDelete={fields.length > 1}
                      ctx={ctx}
                      onClose={() => setFieldMenu(null)}
                      onNotice={onNotice}
                    />
                  )}
                </span>
              </th>
            ))}
            <th className="nq-ctable-tools">
              <span className="nq-ctable-anchor">
                <button type="button" className="nq-ctable-add" aria-label="Aggiungi campo" title="Aggiungi campo" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)}>
                  <MdAdd />
                </button>
                {addOpen && (
                  <>
                    <div className="nq-fmenu-backdrop" onClick={() => setAddOpen(false)} />
                    <div className="nq-fmenu nq-ctable-types" role="menu" aria-label="Tipo del campo nuovo">
                      {FIELD_TYPES.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          role="menuitem"
                          className="nq-fmenu-btn"
                          onClick={() => {
                            setAddOpen(false);
                            onAddField(t.key);
                          }}
                        >
                          <FieldIcon type={t.key} /> {t.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {fields.map((f, i) => (
                <td key={f.id} className={`${f.type === "number" ? "is-num" : ""}${i === 0 ? " is-primary" : ""}`}>
                  <CellEditor field={f} value={r.data[String(f.id)] ?? null} onChange={(v) => onCell(r, f, v)} notes={notes} onOpenNote={onOpenNote} onNotice={onNotice} />
                </td>
              ))}
              <td className="nq-ctable-tools">
                <span className="nq-ctable-rowbtns">
                  <button type="button" aria-label="Apri la scheda della riga" title="Apri la scheda" onClick={() => onOpenRow(r)}>
                    <MdOpenInFull />
                  </button>
                  <button type="button" aria-label="Elimina la riga" title="Elimina la riga" onClick={() => onDeleteRow(r)}>
                    <MdDeleteOutline />
                  </button>
                </span>
              </td>
            </tr>
          ))}
          <tr className="nq-ctable-addrow">
            <td colSpan={fields.length + 1}>
              <button type="button" onClick={onAddRow}>
                + Nuova riga
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default CollectionTable;
