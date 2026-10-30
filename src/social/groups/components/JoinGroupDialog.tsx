import { useState, type FormEvent } from "react";
import type { JoinGroupResult } from "../../../core/cloud/groupsApi";
import { formatInviteCode, isInviteCodeComplete } from "../../../core/cloud/inviteCode";
import { useGroups } from "../useGroups";
import GroupsDialog from "./GroupsDialog";
import { AlertIcon } from "./icons";
import { messageOf } from "../messages";

const RESULT_MESSAGES: Record<Exclude<JoinGroupResult, "ok">, string> = {
  invalid: "Codice non valido o scaduto. Dopo troppi tentativi dovrai aspettare qualche minuto.",
  full: "Questo gruppo è al completo (massimo 30 membri).",
  rate_limited: "Troppi tentativi: aspetta qualche minuto e riprova.",
  already_member: "Fai già parte di questo gruppo.",
};

/** "Entra con un codice": il codice si scrive come lo si legge (K7QM-3XRQ), minuscole e spazi vanno bene. */
function JoinGroupDialog({ onClose }: { onClose: () => void }) {
  const { joinGroup } = useGroups();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isInviteCodeComplete(code)) {
      // non si spreca un tentativo per un errore di battitura
      setError(RESULT_MESSAGES.invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await joinGroup(code);
      if (result === "ok") {
        onClose();
        return;
      }
      setError(RESULT_MESSAGES[result]);
    } catch (err) {
      setError(messageOf(err));
    }
    setSaving(false);
  }

  return (
    <GroupsDialog title="Entra con un codice" intro="Chiedilo a un membro del gruppo." onClose={onClose}>
      <form className="grp-form" onSubmit={handleSubmit}>
        <label className="grp-label">
          Codice invito
          <input
            type="text"
            className={`grp-field grp-field--code${error ? " is-error" : ""}`}
            value={code}
            onChange={(e) => {
              setCode(formatInviteCode(e.target.value));
              setError(null);
            }}
            maxLength={9}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "grp-join-error" : undefined}
          />
        </label>
        {error && (
          <div id="grp-join-error" className="grp-error-box" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}
        <div className="grp-actions">
          <button type="button" className="grp-btn grp-btn--ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="grp-btn" disabled={saving}>
            Entra
          </button>
        </div>
      </form>
    </GroupsDialog>
  );
}

export default JoinGroupDialog;
