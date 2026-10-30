import { useState, type FormEvent } from "react";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX } from "../../../core/cloud/groupsApi";
import { useGroups } from "../useGroups";
import GroupsDialog from "./GroupsDialog";
import { messageOf } from "../messages";

/** "Crea un gruppo": nome e descrizione facoltativa; chi lo crea ne è il proprietario. */
function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const { createGroup } = useGroups();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Dai un nome al gruppo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createGroup(cleanName, description.trim());
      onClose();
    } catch (err) {
      setError(messageOf(err));
      setSaving(false);
    }
  }

  return (
    <GroupsDialog title="Crea un gruppo" onClose={onClose}>
      <form className="grp-form" onSubmit={handleSubmit}>
        <label className="grp-label">
          <span className="grp-label-row">
            <span>Nome</span>
            <span className="grp-muted">
              {name.length} / {GROUP_NAME_MAX}
            </span>
          </span>
          <input
            type="text"
            className="grp-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={GROUP_NAME_MAX}
            autoComplete="off"
          />
        </label>
        <label className="grp-label">
          <span className="grp-label-row">
            <span>Descrizione (facoltativa)</span>
            <span className="grp-muted">
              {description.length} / {GROUP_DESCRIPTION_MAX}
            </span>
          </span>
          <textarea
            className="grp-field grp-field--area"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={GROUP_DESCRIPTION_MAX}
            placeholder="Per cosa studiate insieme?"
          />
        </label>
        <p className="grp-note">Riceverai un codice invito da mandare agli amici. Massimo 30 membri.</p>
        {error && <p className="grp-error" role="alert">{error}</p>}
        <div className="grp-actions">
          <button type="button" className="grp-btn grp-btn--ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="grp-btn" disabled={saving}>
            Crea gruppo
          </button>
        </div>
      </form>
    </GroupsDialog>
  );
}

export default CreateGroupDialog;
