import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { groupRows, type Field, type Row, type ValueContext } from "../lib/collections";
import ChoiceChip from "./ChoiceChip";
import RowTile from "./RowTile";
import "./CollectionBoard.css";

interface CollectionBoardProps {
  fields: Field[];
  rows: Row[];
  /** Campo delle colonne (select o date); null = da scegliere. */
  groupField: Field | null;
  ctx: ValueContext;
  onOpenRow: (row: Row) => void;
  /** Spostata in un'altra colonna (solo con un campo select): nuovo valore, "" = senza valore. */
  onMoveRow: (row: Row, key: string) => void;
  onAddRow: (key: string) => void;
}

interface DragState {
  row: Row;
  x: number;
  y: number;
  over: string | null;
}

/**
 * Vista "Bacheca": una colonna per scelta (campo select) o per settimana (campo date).
 * Con le scelte le schede si spostano trascinandole tra le colonne (col puntatore: il
 * trascinamento HTML è preso dalla finestra Tauri per i file).
 */
function CollectionBoard({ fields, rows, groupField, ctx, onOpenRow, onMoveRow, onAddRow }: CollectionBoardProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const justDragged = useRef(false);

  if (!groupField) {
    return <p className="nq-board-empty">Per la bacheca serve un campo Scelta o Data: aggiungilo dalla tabella, poi sceglilo qui sopra in “Colonne per”.</p>;
  }

  const groups = groupRows(rows, groupField, ctx.now);
  const movable = groupField.type === "select";

  function startDrag(e: ReactPointerEvent<HTMLButtonElement>, row: Row) {
    if (!movable || e.button !== 0) return;
    const el = e.currentTarget;
    const id = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    let moving = false;
    const overAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-group]")?.dataset.group ?? null;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!moving && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!moving) {
        moving = true;
        try {
          el.setPointerCapture(id);
        } catch {
          /* già rilasciato */
        }
      }
      setDrag({ row, x: ev.clientX, y: ev.clientY, over: overAt(ev.clientX, ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      if (!moving) return;
      // Il rilascio genera un click sulla scheda: non deve aprirla.
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 0);
      const target = ev.type === "pointerup" ? overAt(ev.clientX, ev.clientY) : null;
      if (target === null) return;
      const current = row.data[String(groupField?.id)];
      if ((typeof current === "string" ? current : "") !== target) onMoveRow(row, target);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <div className="nq-board">
      {groups.map((g) => (
        <section key={g.key || "vuoto"} className={`nq-bcol${drag?.over === g.key ? " is-over" : ""}`} data-group={g.key} aria-label={g.label}>
          <h4>
            {g.color ? <ChoiceChip label={g.label} color={g.color} /> : <span>{g.label}</span>}
            <span className="nq-bcol-count">{g.rows.length}</span>
          </h4>
          <div className="nq-bcol-list">
            {g.rows.map((r) => (
              <div key={r.id}>
                <RowTile
                  fields={fields}
                  row={r}
                  ctx={ctx}
                  skipField={groupField.id}
                  dragging={drag?.row.id === r.id}
                  onPointerDown={(e) => startDrag(e, r)}
                  onOpen={() => {
                    if (!justDragged.current) onOpenRow(r);
                  }}
                />
              </div>
            ))}
          </div>
          {movable && (
            <button type="button" className="nq-bcol-add" onClick={() => onAddRow(g.key)}>
              + Nuova riga
            </button>
          )}
        </section>
      ))}
      {drag && (
        <div className="nq-board-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }} aria-hidden="true">
          Sposta
        </div>
      )}
    </div>
  );
}

export default CollectionBoard;
