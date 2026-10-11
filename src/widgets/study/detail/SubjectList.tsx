import { useState, type FormEvent } from "react";
import {
  MdAdd,
  MdDeleteOutline,
  MdOutlineAvTimer,
  MdOutlineHourglassBottom,
  MdPlayArrow,
  MdSettings,
} from "react-icons/md";
import { useSettings } from "../../../core/settings/SettingsContext";
import SubjectSettingsPopup from "../components/SubjectSettingsPopup";
import type { SubjectMode } from "../data/studyRepository";
import { colorForSubject } from "../lib/colors";
import { formatHoursMinutes } from "../lib/format";
import { useTimer } from "../timer/TimerContext";

/** Elenco materie (avvio, impostazioni, eliminazione) + form per aggiungerne. */
function SubjectList() {
  const { phase, subjectId, subjects, todayBySubject, startWork, addSubject, updateSubject, removeSubject } = useTimer();
  const { settings } = useSettings();

  const [newName, setNewName] = useState("");
  // null = si usa la modalità predefinita delle impostazioni.
  const [newMode, setNewMode] = useState<SubjectMode | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<number | null>(null);

  const effectiveNewMode = newMode ?? settings.studyDefaultMode;
  const canStart = phase === "idle";
  const settingsIndex = subjects.findIndex((s) => s.id === settingsId);
  const settingsSubject = settingsIndex >= 0 ? subjects[settingsIndex] : null;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    const result = await addSubject(newName, effectiveNewMode);
    if (result === "ok") setNewName("");
    else if (result === "duplicate") setAddError("Esiste già una materia con questo nome.");
    else if (result === "error") setAddError("Impossibile aggiungere la materia.");
  }

  return (
    <section className="study-subjects-card">
      <h2 className="study-section-title">Materie</h2>

      <div className="study-subjects-list">
        {subjects.length === 0 && <p className="study-empty">Nessuna materia ancora. Aggiungine una qui sotto per iniziare.</p>}

        {subjects.map((subject, index) => {
          const isActive = subject.id === subjectId;
          return (
            <div key={subject.id} className={`study-subject-row${isActive ? " is-active" : ""}`}>
              <button
                type="button"
                className={`study-row-gear${settingsId === subject.id ? " is-open" : ""}`}
                onClick={() => setSettingsId(subject.id)}
                aria-label={`Impostazioni ${subject.name}`}
                title="Impostazioni materia"
              >
                <MdSettings />
              </button>
              <span className="study-subject-dot" style={{ background: colorForSubject(subject, index) }} />
              <span className="study-subject-name">{subject.name}</span>
              <span className="study-subject-mode" title={subject.mode === "stopwatch" ? "Cronometro" : "Pomodoro"}>
                {subject.mode === "stopwatch" ? <MdOutlineAvTimer /> : <MdOutlineHourglassBottom />}
              </span>
              <span className="study-subject-time">{formatHoursMinutes(todayBySubject[subject.id] ?? 0)}</span>
              <button
                type="button"
                className="study-icon-btn study-icon-btn--small"
                disabled={!canStart}
                onClick={() => startWork(subject.id)}
                aria-label={`Studia ${subject.name}`}
                title={canStart ? `Studia ${subject.name}` : "Ferma la sessione in corso per cambiare materia"}
              >
                <MdPlayArrow />
              </button>
              <button
                type="button"
                className="study-icon-btn study-icon-btn--small study-icon-btn--muted"
                disabled={isActive}
                onClick={() => removeSubject(subject.id)}
                aria-label={`Rimuovi ${subject.name}`}
                title={isActive ? "Non puoi rimuovere la materia in corso di studio" : "Rimuovi materia"}
              >
                <MdDeleteOutline />
              </button>
            </div>
          );
        })}
      </div>

      <form className="study-add-subject" onSubmit={handleAdd}>
        <input type="text" placeholder="Nuova materia…" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button
          type="button"
          className="study-icon-btn study-icon-btn--muted study-add-mode"
          onClick={() => setNewMode(effectiveNewMode === "pomodoro" ? "stopwatch" : "pomodoro")}
          aria-label="Cambia modalità della nuova materia"
          title={effectiveNewMode === "pomodoro" ? "Pomodoro (clicca per Cronometro)" : "Cronometro (clicca per Pomodoro)"}
        >
          {effectiveNewMode === "pomodoro" ? <MdOutlineHourglassBottom /> : <MdOutlineAvTimer />}
        </button>
        <button type="submit" className="study-icon-btn" aria-label="Aggiungi materia">
          <MdAdd />
        </button>
      </form>
      {addError && <p className="study-form-error">{addError}</p>}

      {settingsSubject && (
        <SubjectSettingsPopup
          subject={settingsSubject}
          color={colorForSubject(settingsSubject, settingsIndex)}
          locked={settingsSubject.id === subjectId}
          onChange={(patch) => updateSubject(settingsSubject.id, patch)}
          onClose={() => setSettingsId(null)}
        />
      )}
    </section>
  );
}

export default SubjectList;
