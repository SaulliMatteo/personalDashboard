import { MdOutlineAvTimer, MdOutlineHourglassBottom } from "react-icons/md";
import type { SubjectMode } from "../data/studyRepository";

interface ModeToggleProps {
  mode: SubjectMode;
  onChange: (mode: SubjectMode) => void;
  disabled?: boolean;
}

/** Selettore Pomodoro / Cronometro. */
function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  return (
    <div className={`study-mode-toggle${disabled ? " is-disabled" : ""}`} role="group" aria-label="Modalità">
      <button type="button" disabled={disabled} className={mode === "pomodoro" ? "active" : ""} onClick={() => onChange("pomodoro")}>
        <MdOutlineHourglassBottom /> Pomodoro
      </button>
      <button type="button" disabled={disabled} className={mode === "stopwatch" ? "active" : ""} onClick={() => onChange("stopwatch")}>
        <MdOutlineAvTimer /> Cronometro
      </button>
    </div>
  );
}

export default ModeToggle;
