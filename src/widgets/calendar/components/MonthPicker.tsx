import { useState, type RefObject } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import Popover from "../../../ui/Popover";
import { MONTHS, capitalize } from "../lib/format";
import "./controls.css";
import "./MonthPicker.css";

interface MonthPickerProps {
  anchor: RefObject<HTMLElement | null>;
  /** Il mese mostrato adesso. */
  year: number;
  month: number;
  now: Date;
  onPick: (year: number, month: number) => void;
  onClose: () => void;
}

/** Scelta rapida di mese e anno (clic sul titolo): l'anno con ‹ ›, poi i 12 mesi. */
function MonthPicker({ anchor, year, month, now, onPick, onClose }: MonthPickerProps) {
  const [shownYear, setShownYear] = useState(year);
  return (
    <Popover anchor={anchor} onClose={onClose} className="cal-picker" label="Scegli mese e anno">
      <div className="cal-picker-year">
        <button type="button" className="cal-btn-icon" aria-label="Anno precedente" onClick={() => setShownYear((y) => y - 1)}>
          <MdChevronLeft aria-hidden="true" />
        </button>
        <span aria-live="polite">{shownYear}</span>
        <button type="button" className="cal-btn-icon" aria-label="Anno successivo" onClick={() => setShownYear((y) => y + 1)}>
          <MdChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="cal-picker-months">
        {MONTHS.map((name, i) => {
          const current = shownYear === year && i === month;
          const isNow = shownYear === now.getFullYear() && i === now.getMonth();
          return (
            <button
              key={name}
              type="button"
              autoFocus={current}
              aria-current={current ? "date" : undefined}
              aria-label={`${capitalize(name)} ${shownYear}`}
              className={`cal-picker-month${current ? " active" : ""}${isNow ? " now" : ""}`}
              onClick={() => onPick(shownYear, i)}
            >
              {capitalize(name.slice(0, 3))}
            </button>
          );
        })}
      </div>
      {(shownYear !== now.getFullYear() || year !== now.getFullYear() || month !== now.getMonth()) && (
        <button type="button" className="cal-picker-today" onClick={() => onPick(now.getFullYear(), now.getMonth())}>
          Torna a oggi
        </button>
      )}
    </Popover>
  );
}

export default MonthPicker;
