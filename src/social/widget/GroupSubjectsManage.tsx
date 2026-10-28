import { useState } from "react";
import {
  deleteGroupSubject,
  GROUP_SUBJECT_NAME_MAX,
  mergeGroupSubjects,
  renameGroupSubject,
  type GroupSubject,
} from "../../core/cloud/groupSubjectsApi";
import ConfirmButton from "../../ui/ConfirmButton";
import { messageOf } from "../groups/messages";
import { subjectColor } from "./subjectColor";
import "./GroupSubjectsManage.css";

function SubjectRow({ subject, others, onChanged }: { subject: GroupSubject; others: GroupSubject[]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subject.name);
  const [into, setInto] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** true se è andata: chi chiama può chiudere la modifica. */
  async function run(action: () => Promise<void>): Promise<boolean> {
    setError(null);
    try {
      await action();
      onChanged();
      return true;
    } catch (e) {
      setError(messageOf(e));
      return false;
    }
  }

  const target = others.find((s) => s.id === into);
  return (
    <li className="gsm-row">
      <span className="gsm-swatch" style={{ background: subjectColor(subject.color) }} aria-hidden="true" />
      {editing ? (
        <span className="gsm-edit">
          <input
            className="grp-field gsm-input"
            aria-label={`Nuovo nome per ${subject.name}`}
            value={name}
            maxLength={GROUP_SUBJECT_NAME_MAX}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button
            type="button"
            className="grp-btn grp-btn--sm"
            disabled={!name.trim() || name.trim() === subject.name}
            onClick={() =>
              void run(() => renameGroupSubject(subject.id, name.trim())).then((ok) => {
                if (ok) setEditing(false);
              })
            }
          >
            Salva
          </button>
          <button
            type="button"
            className="grp-btn grp-btn--plain grp-btn--sm"
            onClick={() => {
              setName(subject.name);
              setEditing(false);
            }}
          >
            Annulla
          </button>
        </span>
      ) : (
        <>
          <span className="gsm-name" title={subject.name}>
            {subject.name}
          </span>
          <button type="button" className="grp-btn grp-btn--ghost grp-btn--sm" onClick={() => setEditing(true)}>
            Rinomina
          </button>
          {others.length > 0 && (
            <label className="gsm-merge">
              <span className="gsm-sr">Unisci {subject.name} a un'altra materia</span>
              <select className="grp-field gsm-select" value={into} onChange={(e) => setInto(e.target.value)}>
                <option value="">Unisci a…</option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {target && (
            <ConfirmButton
              label={`Unisci a ${target.name}`}
              className="grp-btn grp-btn--sm"
              onConfirm={() => void run(() => mergeGroupSubjects(subject.id, target.id))}
            />
          )}
          <ConfirmButton
            label="Elimina"
            className="grp-btn grp-btn--danger grp-btn--sm"
            onConfirm={() => void run(() => deleteGroupSubject(subject.id))}
          />
        </>
      )}
      {error && (
        <span className="grp-error gsm-error" role="alert">
          {error}
        </span>
      )}
    </li>
  );
}

/**
 * Materie del gruppo, per il proprietario: rinominare, unire (i tempi si sommano e gli abbinamenti di tutti seguono
 * la materia unita) ed eliminare (spariscono i tempi di quella materia per tutti). Per separare due materie unite
 * se ne crea una nuova: chi ha una materia con quel nome se la vedrà proporre.
 */
function GroupSubjectsManage({ subjects, onChanged }: { subjects: GroupSubject[]; onChanged: () => void }) {
  if (subjects.length === 0) return null;
  return (
    <section className="gsm" aria-labelledby="gsm-title">
      <div className="gsm-head">
        <h3 id="gsm-title">Materie del gruppo</h3>
        <span className="grp-muted">
          Come proprietario puoi rinominarle, unirle (i tempi si sommano) o eliminarle (si cancellano i tempi di quella
          materia per tutti). Per separarne due, crea una nuova materia: chi ne ha una con quel nome se la vedrà
          proporre.
        </span>
      </div>
      <ul className="gsm-list">
        {subjects.map((s) => (
          <SubjectRow key={`${s.id}:${s.name}`} subject={s} others={subjects.filter((o) => o.id !== s.id)} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

export default GroupSubjectsManage;
