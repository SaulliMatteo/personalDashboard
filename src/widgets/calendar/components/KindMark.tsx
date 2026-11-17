import "./ItemChip.css";

/**
 * event = quadratino, study = cerchio (pieno = fatta), reminder = campanella (piena = fatto), note = foglio:
 * la forma dice il tipo in tutti i temi.
 */
export type ChipKind = "event" | "study" | "reminder" | "note";

/** Il segno della forma, da solo (chip, filtri, legenda, card). */
function KindMark({ kind, filled, className }: { kind: ChipKind; filled?: boolean; className?: string }) {
  return <i aria-hidden="true" className={`cal-mark cal-mark--${kind}${filled ? " cal-mark--filled" : ""}${className ? ` ${className}` : ""}`} />;
}

export default KindMark;
