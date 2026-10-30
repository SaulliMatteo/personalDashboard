import { useState, type FormEvent } from "react";
import { useCloud } from "../../../core/cloud/useCloud";
import { normalizeUsername, usernameProblem } from "../../../core/cloud/username";
import GroupsDialog from "./GroupsDialog";
import { CheckIcon } from "./icons";
import { messageOf } from "../messages";

/**
 * Primo accesso: "Scegli il tuo nome". La disponibilità si sa solo inviando (il server non rivela i nomi
 * degli altri): prima dell'invio si controlla soltanto il formato.
 */
function UsernameDialog({ onClose }: { onClose: () => void }) {
  const { setUsername } = useCloud();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const name = normalizeUsername(draft);
  const problem = name ? usernameProblem(name) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name || problem) {
      setError(problem ?? "Scegli un nome.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setUsername(name);
      onClose();
    } catch (err) {
      setError(messageOf(err));
      setSaving(false);
    }
  }

  return (
    <GroupsDialog
      title="Scegli il tuo nome"
      intro="È l'unica cosa di te che vedranno gli altri. Email e nome Google restano privati."
      onClose={onClose}
    >
      <form className="grp-form" onSubmit={handleSubmit}>
        <label className="grp-label">
          Nome utente
          <input
            type="text"
            className={`grp-field${error ? " is-error" : ""}`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
          />
        </label>
        <div className="grp-hint-row">
          <span className="grp-muted">3–20 caratteri: lettere minuscole, numeri, _ e .</span>
          {name && !problem && !error && (
            <span className="grp-ok">
              <CheckIcon />
              Formato valido
            </span>
          )}
        </div>
        {error && <p className="grp-error" role="alert">{error}</p>}
        <button type="submit" className="grp-btn grp-btn--wide" disabled={saving}>
          Continua
        </button>
      </form>
    </GroupsDialog>
  );
}

export default UsernameDialog;
