import type { PointerEvent as ReactPointerEvent } from "react";
import { choiceOf, valueText, type Field, type Row, type ValueContext } from "../lib/collections";
import ChoiceChip from "./ChoiceChip";
import "./RowTile.css";

interface RowTileProps {
  fields: Field[];
  row: Row;
  ctx: ValueContext;
  /** Campo da non ripetere nei dettagli (quello della colonna della bacheca). */
  skipField?: number | null;
  onOpen: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  dragging?: boolean;
}

/** Una riga come scheda (viste Schede e Bacheca): titolo, due dettagli, le scelte. */
function RowTile({ fields, row, ctx, skipField, onOpen, onPointerDown, dragging }: RowTileProps) {
  const [primary, ...rest] = fields;
  const title = primary ? valueText(primary, row.data[String(primary.id)] ?? null, ctx) : "";
  const details = rest
    .filter((f) => f.id !== skipField && f.type !== "select" && f.type !== "multi" && f.type !== "check" && f.type !== "file")
    .map((f) => valueText(f, row.data[String(f.id)] ?? null, ctx))
    .filter(Boolean)
    .slice(0, 2);
  const chips = rest
    .filter((f) => f.id !== skipField && (f.type === "select" || f.type === "multi"))
    .flatMap((f) => {
      const v = row.data[String(f.id)];
      const ids = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
      return ids.flatMap((id) => {
        const c = choiceOf(f, id);
        return c ? [{ key: `${f.id}-${id}`, label: c.label, color: c.color }] : [];
      });
    })
    .slice(0, 3);

  return (
    <button type="button" className={`nq-tile${dragging ? " is-dragging" : ""}`} onClick={onOpen} onPointerDown={onPointerDown} aria-label={`Apri ${title || "la riga"}`}>
      <b>{title || "Senza titolo"}</b>
      {details.length > 0 && <small>{details.join(", ")}</small>}
      {chips.length > 0 && (
        <span className="nq-tile-chips">
          {chips.map((c) => (
            <ChoiceChip key={c.key} label={c.label} color={c.color} />
          ))}
        </span>
      )}
    </button>
  );
}

export default RowTile;
