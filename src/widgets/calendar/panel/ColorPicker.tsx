import type { CSSProperties } from "react";
import { EVENT_COLORS, colorName } from "../lib/palette";

/* Fila di colori da scegliere (eventi e categorie); `allowNone` aggiunge "come la categoria". */
function ColorPicker({ value, onChange, allowNone }: { value: string | null; onChange: (c: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="cal-colors" role="radiogroup" aria-label="Colore">
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="Come la categoria"
          className="cal-color cal-color--none"
          onClick={() => onChange(null)}
        />
      )}
      {EVENT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value?.toUpperCase() === c}
          aria-label={colorName(c)}
          className="cal-color"
          style={{ "--item": c } as CSSProperties}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export default ColorPicker;
