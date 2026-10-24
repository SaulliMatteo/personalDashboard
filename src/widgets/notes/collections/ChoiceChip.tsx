import type { ChoiceColor } from "../lib/collections";
import "./ChoiceChip.css";

/** Una scelta (campo select/multi) come chip colorato: colori dai token --tint-* del tema. */
function ChoiceChip({ label, color }: { label: string; color: ChoiceColor }) {
  return (
    <span className="nq-choice" data-color={color}>
      {label || "Senza nome"}
    </span>
  );
}

export default ChoiceChip;
