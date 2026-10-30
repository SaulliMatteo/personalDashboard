import type { Field, Row, ValueContext } from "../lib/collections";
import RowTile from "./RowTile";
import "./CollectionCards.css";

interface CollectionCardsProps {
  fields: Field[];
  rows: Row[];
  ctx: ValueContext;
  onOpenRow: (row: Row) => void;
  onAddRow: () => void;
}

/** Vista "Schede": una scheda per riga; un clic apre la scheda completa. */
function CollectionCards({ fields, rows, ctx, onOpenRow, onAddRow }: CollectionCardsProps) {
  return (
    <div className="nq-tiles">
      {rows.map((r) => (
        <div key={r.id}>
          <RowTile fields={fields} row={r} ctx={ctx} onOpen={() => onOpenRow(r)} />
        </div>
      ))}
      <div>
        <button type="button" className="nq-tiles-add" onClick={onAddRow}>
          + Nuova riga
        </button>
      </div>
    </div>
  );
}

export default CollectionCards;
