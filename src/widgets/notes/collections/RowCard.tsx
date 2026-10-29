import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdDeleteOutline } from "react-icons/md";
import { formatDate, toDateString, type CellValue, type Field, type Row, type ValueContext } from "../lib/collections";
import CellEditor, { type NoteRef } from "./CellEditor";
import FieldIcon from "./FieldIcon";
import "./RowCard.css";

interface RowCardProps {
  collectionName: string;
  fields: Field[];
  row: Row;
  notes: NoteRef[];
  ctx: ValueContext;
  onCell: (field: Field, value: CellValue) => void;
  onDelete: () => void;
  onClose: () => void;
  onOpenNote: (id: number) => void;
  onNotice: (message: string) => void;
}

/** Scheda di una riga: tutti i campi uno sotto l'altro. Esc o un clic fuori la chiude. */
function RowCard({ collectionName, fields, row, notes, ctx, onCell, onDelete, onClose, onOpenNote, onNotice }: RowCardProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return createPortal(
    <div
      className="nq-rowcard-bg"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="nq-rowcard" role="dialog" aria-modal="true" aria-label={`Riga di ${collectionName}`}>
        <div className="nq-rowcard-head">
          <span>{collectionName}</span>
          <button ref={closeRef} type="button" className="nq-icon-btn" onClick={onClose} aria-label="Chiudi la scheda">
            <MdClose />
          </button>
        </div>
        <div className="nq-rowcard-fields">
          {fields.map((f, i) => (
            <div key={f.id} role="group" aria-label={f.name} className={`nq-rowcard-field${i === 0 ? " is-primary" : ""}`}>
              <span className="nq-rowcard-name">
                <FieldIcon type={f.type} /> {f.name}
              </span>
              <span className="nq-rowcard-value">
                <CellEditor field={f} value={row.data[String(f.id)] ?? null} onChange={(v) => onCell(f, v)} notes={notes} onOpenNote={onOpenNote} onNotice={onNotice} />
              </span>
            </div>
          ))}
        </div>
        <div className="nq-rowcard-foot">
          <small>Modificata il {formatDate(toDateString(new Date(row.updatedAt)), ctx.now)}</small>
          <button type="button" className="nq-btn nq-btn--small nq-rowcard-del" onClick={onDelete}>
            <MdDeleteOutline aria-hidden="true" /> Elimina riga
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default RowCard;
