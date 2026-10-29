import { useState, type FormEvent } from "react";
import { useCloud } from "../../../core/cloud/useCloud";
import { normalizeUsername, usernameProblem, USERNAME_RULES } from "../../../core/cloud/username";
import ConfirmButton from "../../../ui/ConfirmButton";
import ExpandableText from "../../../ui/ExpandableText";

/** Messaggio di un errore delle azioni di useCloud (sempre una frase nostra, mai il testo del server). */
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Qualcosa è andato storto. Riprova.";
}

/** Scelta (primo accesso) o cambio del nome utente: l'unico dato visibile agli altri. */
function UsernameForm({ current }: { current: string | null }) {
  const { setUsername } = useCloud();
  const [draft, setDraft] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const name = normalizeUsername(draft);
  const unchanged = current !== null && name === current;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = usernameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setUsername(name);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-field" onSubmit={handleSubmit}>
      <div className="settings-field-text">
        <label className="settings-field-label" htmlFor="account-username">
          {current === null ? "Scegli il tuo nome utente" : "Nome utente"}
        </label>
        <ExpandableText className="settings-field-description">
          È l'unica cosa di te che vedono gli altri membri dei gruppi. {USERNAME_RULES}
        </ExpandableText>
        {error && (
          <p className="settings-field-description" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="settings-field-control">
        <input
          id="account-username"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={20}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="sp-btn" disabled={saving || name === "" || unchanged}>
          Salva
        </button>
      </div>
    </form>
  );
}

/** Accesso con Google (o attesa del ritorno dal browser). */
function SignInField() {
  const { signingIn, signInError, signIn, cancelSignIn } = useCloud();
  return (
    <div className="settings-field">
      <div className="settings-field-text">
        <span className="settings-field-label">{signingIn ? "Completa l'accesso nel browser" : "Accedi con Google"}</span>
        <ExpandableText className="settings-field-description">
          {signingIn
            ? "Si è aperta una pagina nel browser: scegli l'account Google e torna qui."
            : "L'accesso avviene nel browser. A Google chiediamo solo l'identità: email e nome reale non vengono mostrati a nessuno."}
        </ExpandableText>
        {signInError && (
          <p className="settings-field-description" role="alert">
            {signInError}
          </p>
        )}
      </div>
      <div className="settings-field-control">
        {signingIn ? (
          <>
            <button type="button" className="sp-btn" onClick={() => void signIn()}>
              Riapri il browser
            </button>
            <button type="button" className="sp-btn sp-btn--ghost" onClick={cancelSignIn}>
              Annulla
            </button>
          </>
        ) : (
          <button type="button" className="sp-btn" onClick={() => void signIn()}>
            Accedi con Google
          </button>
        )}
      </div>
    </div>
  );
}

/** Esci ed elimina account. */
function AccountActions({ canDelete }: { canDelete: boolean }) {
  const { signOut, deleteAccount } = useCloud();
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(messageOf(e));
    }
  }

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">Account</h4>
      {error && (
        <p className="settings-field-description" role="alert">
          {error}
        </p>
      )}
      <div className="settings-fields">
        <div className="settings-field">
          <div className="settings-field-text">
            <span className="settings-field-label">Esci</span>
            <ExpandableText className="settings-field-description">Esci da questo computer. I tuoi dati locali restano dove sono.</ExpandableText>
          </div>
          <div className="settings-field-control">
            <button type="button" className="sp-btn" onClick={() => void run(signOut)}>
              Esci
            </button>
          </div>
        </div>
        {canDelete && (
          <div className="settings-field">
            <div className="settings-field-text">
              <span className="settings-field-label">Elimina account</span>
              <ExpandableText className="settings-field-description">
                Cancella dal servizio online il tuo profilo, i dispositivi, le iscrizioni ai gruppi e i totali di studio
                condivisi. Se sei owner, il gruppo passa al membro più anziano. Le sessioni di studio su questo computer
                restano.
              </ExpandableText>
            </div>
            <div className="settings-field-control">
              <ConfirmButton className="sp-btn sp-btn--danger" label="Elimina account" onConfirm={() => run(deleteAccount)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Informativa: cosa esce dal computer e chi lo vede. */
function PrivacySection() {
  return (
    <div className="settings-section">
      <h4 className="settings-section-title">Cosa viene condiviso</h4>
      <p className="settings-field-description">
        Con chi è in almeno un gruppo con te: il nome utente, i minuti di studio di ogni giorno (degli ultimi 14 giorni al
        primo accesso, poi man mano), l'ultima volta che sei stato collegato e, mentre lo sei, se stai studiando o sei
        in pausa con il timer in corso e la sala che hai scelto nella stanza comune. Del tuo Pixy, la personalità, il
        colore e se ha la bocca.
      </p>
      <p className="settings-field-description">
        Il nome della materia, le pose e le espressioni di Pixy (rivelano che tipo di app hai in primo piano) e i suoi
        fumetti solo se li attivi tu. Le singole sessioni, le materie, le note e tutto il resto non escono
        dal computer. I dati online stanno su Supabase, in Europa; eliminando l'account vengono cancellati.
      </p>
    </div>
  );
}

function AccountTab() {
  const { status, retry } = useCloud();

  let body;
  switch (status.kind) {
    case "unconfigured":
      body = (
        <p className="settings-field-description">
          Gruppi non configurati: questa versione dell'app non ha i dati del servizio online. Tutto il resto funziona
          normalmente.
        </p>
      );
      break;
    case "unavailable":
      body = (
        <p className="settings-field-description">
          Il portachiavi del sistema non è disponibile, quindi l'accesso ai Gruppi non si può salvare in modo sicuro su
          questo computer. Funziona su Windows e macOS.
        </p>
      );
      break;
    case "loading":
      body = <p className="settings-field-description">Controllo dell'accesso…</p>;
      break;
    case "unreachable":
      body = (
        <>
          <div className="settings-section">
            <div className="settings-fields">
              <div className="settings-field">
                <div className="settings-field-text">
                  <span className="settings-field-label">Gruppi non raggiungibili</span>
                  <ExpandableText className="settings-field-description">
                    Sei offline oppure il servizio è in pausa. Riprovo da solo; intanto l'app funziona normalmente.
                  </ExpandableText>
                </div>
                <div className="settings-field-control">
                  <button type="button" className="sp-btn" onClick={retry}>
                    Riprova
                  </button>
                </div>
              </div>
            </div>
          </div>
          <AccountActions canDelete={false} />
        </>
      );
      break;
    case "signedOut":
      body = (
        <>
          <div className="settings-section">
            <div className="settings-fields">
              <SignInField />
            </div>
          </div>
          <PrivacySection />
        </>
      );
      break;
    case "needsUsername":
    case "ready":
      body = (
        <>
          <div className="settings-section">
            <h4 className="settings-section-title">Profilo</h4>
            <div className="settings-fields">
              <UsernameForm
                key={status.kind === "ready" ? status.username : ""}
                current={status.kind === "ready" ? status.username : null}
              />
            </div>
          </div>
          <PrivacySection />
          <AccountActions canDelete />
        </>
      );
      break;
  }

  return (
    <>
      <header className="sp-head">
        <h2>Account</h2>
        <p>L'accesso per i Gruppi: studia con gli amici e guarda a che punto sono.</p>
      </header>
      {body}
    </>
  );
}

export default AccountTab;
