import type { CSSProperties, HTMLAttributes, Ref } from "react";
import type { StudyState } from "../lib/studyProgress";
import KindMark, { type ChipKind } from "./KindMark";
import "./ItemChip.css";

/*
 * Un elemento del calendario in una riga (cella del mese, riga "giorno", card). La FORMA dice il tipo, in tutti i temi:
 *  - evento: quadratino pieno del colore (categoria o scelto);
 *  - sessione di studio: cerchio, vuoto "in programma", pieno "fatta";
 *  - promemoria: campanella, vuota "da fare", piena "fatto";
 *  - nota collegata: chip col bordo tratteggiato e l'iconcina del foglio.
 */

interface ItemChipProps extends Omit<HTMLAttributes<HTMLButtonElement>, "color"> {
  kind: ChipKind;
  label: string;
  /** "15:00" davanti al nome (niente per "tutto il giorno" e per le note). */
  time?: string;
  /** Colore scelto dall'utente; null = quello del tema. */
  color?: string | null;
  studyState?: StudyState;
  /** Promemoria spuntato. */
  done?: boolean;
  dragging?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}

function ItemChip({ kind, label, time, color, studyState, done: reminderDone, dragging, buttonRef, className, style, ...rest }: ItemChipProps) {
  const done = (kind === "study" && studyState === "done") || (kind === "reminder" && reminderDone === true);
  const stateText =
    kind === "study"
      ? studyState === "done"
        ? ", fatta"
        : studyState === "running"
          ? ", in corso"
          : studyState === "missed"
            ? ", non fatta"
            : ", in programma"
      : kind === "note"
        ? ", nota"
        : kind === "reminder"
          ? reminderDone
            ? ", promemoria fatto"
            : ", promemoria"
          : "";
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`cal-chip cal-chip--${kind}${studyState ? ` cal-chip--${studyState}` : ""}${kind === "reminder" && reminderDone ? " cal-chip--done" : ""}${color ? " cal-chip--colored" : ""}${
        dragging ? " cal-chip--dragging" : ""
      }${className ? ` ${className}` : ""}`}
      style={color ? ({ "--item": color, ...style } as CSSProperties) : style}
      aria-label={`${time ? `${time} ` : ""}${label}${stateText}`}
      {...rest}
    >
      <KindMark kind={kind} filled={done} />
      {time && <span className="cal-chip-time">{time} </span>}
      {label}
    </button>
  );
}

export default ItemChip;
