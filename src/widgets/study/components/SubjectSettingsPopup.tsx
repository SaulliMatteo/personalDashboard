import { useEffect } from "react";
import { MdClose } from "react-icons/md";
import NumberField from "../../../ui/NumberField";
import type { Subject, SubjectSettingsPatch } from "../data/studyRepository";
import { SUBJECT_COLORS } from "../lib/colors";
import ModeToggle from "./ModeToggle";
import "./subjectSettingsPopup.css";

interface SubjectSettingsPopupProps {
  subject: Subject;
  /** Colore effettivo mostrato accanto al nome (può derivare dalla palette). */
  color: string;
  /** True per la materia in corso di studio: cambiarne la modalità a metà sessione non avrebbe senso. */
  locked: boolean;
  onChange: (patch: SubjectSettingsPatch) => void;
  onClose: () => void;
}

const DURATION_FIELDS = [
  { key: "workMinutes", label: "Lavoro (min)", max: 180 },
  { key: "shortBreakMinutes", label: "Pausa breve (min)", max: 60 },
  { key: "longBreakMinutes", label: "Pausa lunga (min)", max: 120 },
  { key: "cyclesBeforeLongBreak", label: "Cicli per pausa lunga", max: 12 },
] as const;

/** Mini finestra con le impostazioni di UNA materia: colore, modalità e durate. */
function SubjectSettingsPopup({ subject, color, locked, onChange, onClose }: SubjectSettingsPopupProps) {
  // Esc chiude il pop-up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="study-popup-overlay" onClick={onClose}>
      <div className="study-popup" role="dialog" aria-label={`Impostazioni ${subject.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="study-popup-header">
          <span className="study-popup-dot" style={{ background: color }} />
          <h3>{subject.name}</h3>
          <button type="button" className="study-popup-close" onClick={onClose} aria-label="Chiudi">
            <MdClose />
          </button>
        </div>

        <div className="study-popup-body">
          <div className="study-setting-line">
            <span className="study-setting-label">Colore</span>
            <div className="study-swatches">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`study-swatch${subject.color === c ? " is-selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => onChange({ color: c })}
                  aria-label={`Colore ${c}`}
                />
              ))}
              <label className="study-swatch study-swatch--custom" title="Colore personalizzato">
                <input type="color" value={subject.color ?? color} onChange={(e) => onChange({ color: e.target.value })} />
              </label>
            </div>
          </div>

          <div className="study-setting-line">
            <span className="study-setting-label">Modalità</span>
            <ModeToggle mode={subject.mode} disabled={locked} onChange={(mode) => onChange({ mode })} />
          </div>

          {subject.mode === "pomodoro" ? (
            <div className="study-setting-grid">
              {DURATION_FIELDS.map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <NumberField value={subject[field.key]} max={field.max} onCommit={(n) => onChange({ [field.key]: n })} />
                </label>
              ))}
            </div>
          ) : (
            <p className="study-setting-note">
              Il cronometro conta in avanti da zero, senza pause né cicli: lo fermi tu e la sessione viene salvata.
            </p>
          )}
          {locked && <p className="study-setting-note">Modalità bloccata finché questa materia è in corso.</p>}
        </div>
      </div>
    </div>
  );
}

export default SubjectSettingsPopup;
