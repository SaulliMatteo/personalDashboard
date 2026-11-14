import { useEffect, useState, type FormEvent } from "react";
import { MdContentCopy, MdLink } from "react-icons/md";
import { formatInviteCode, isInviteCodeComplete } from "../../core/cloud/inviteCode";
import GroupsDialog from "../groups/components/GroupsDialog";
import { AlertIcon } from "../groups/components/icons";
import { messageOf } from "../groups/messages";
import FriendAvatar from "./FriendAvatar";
import { friendLink, listTime, requestResultText } from "./friendsStore";
import { useFriends } from "./useFriends";
import "./AddFriendDialog.css";

/**
 * "Aggiungi un amico" (docs/mockup/gruppi/amici-notifiche.html, vista 6): il mio codice da copiare o mandare come link,
 * il codice di un amico, le richieste ricevute e quelle inviate. Si apre anche dal link personaldashboard://amici/…
 * col codice già scritto.
 */
function AddFriendDialog({ initialCode, onClose }: { initialCode: string; onClose: () => void }) {
  const { status, data, myCode, loadMyCode, regenerateCode, requestFriend, answerRequest, cancelRequest } = useFriends();
  const [code, setCode] = useState(() => formatInviteCode(initialCode));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const ready = status === "ready";

  useEffect(() => {
    if (ready && myCode === null) loadMyCode().catch((e: unknown) => setError(messageOf(e)));
  }, [ready, myCode, loadMyCode]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = (what: "code" | "link") => {
    if (!myCode) return;
    setError(null);
    navigator.clipboard
      .writeText(what === "code" ? formatInviteCode(myCode) : friendLink(myCode))
      .then(() => setCopied(what))
      .catch(() => setError("Non riesco a copiarlo: copialo a mano."));
  };

  const run = async (task: () => Promise<void>) => {
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(messageOf(e));
    }
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isInviteCodeComplete(code)) {
      // non si spreca un tentativo per un errore di battitura
      setResult({ ok: false, text: requestResultText("invalid") });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const status = await requestFriend(code);
      const ok = status === "sent" || status === "accepted";
      setResult({ ok, text: requestResultText(status) });
      if (ok) setCode("");
    } catch (err) {
      setResult({ ok: false, text: messageOf(err) });
    }
    setSaving(false);
  }

  const received = data.requests.filter((r) => r.direction === "in");
  const sent = data.requests.filter((r) => r.direction === "out");

  return (
    <GroupsDialog title="Aggiungi un amico" onClose={onClose}>
      <section className="afd-section" aria-label="Il tuo codice">
        <h3 className="afd-cap">Il tuo codice</h3>
        <div className="afd-code">
          <b>{myCode ? formatInviteCode(myCode) : "…"}</b>
          <button type="button" className="grp-btn grp-btn--ghost grp-btn--sm" onClick={() => copy("code")} disabled={!myCode}>
            <MdContentCopy aria-hidden="true" /> {copied === "code" ? "Copiato" : "Copia"}
          </button>
          <button type="button" className="grp-btn grp-btn--ghost grp-btn--sm" onClick={() => copy("link")} disabled={!myCode}>
            <MdLink aria-hidden="true" /> {copied === "link" ? "Copiato" : "Link"}
          </button>
        </div>
        <p className="grp-muted afd-hint">
          Chi lo inserisce ti manda una richiesta; diventate amici quando la accetti.{" "}
          {!confirmNew && (
            <button type="button" className="afd-link" onClick={() => setConfirmNew(true)} disabled={!myCode}>
              Nuovo codice
            </button>
          )}
        </p>
        {confirmNew && (
          <div className="grp-warn afd-confirm">
            <span>Il codice di adesso smetterà subito di funzionare.</span>
            <button type="button" className="grp-btn grp-btn--sm" onClick={() => void run(regenerateCode).then(() => setConfirmNew(false))}>
              Cambia codice
            </button>
            <button type="button" className="grp-btn grp-btn--ghost grp-btn--sm" onClick={() => setConfirmNew(false)}>
              Annulla
            </button>
          </div>
        )}
      </section>

      <form className="afd-section" onSubmit={handleSubmit}>
        <label className="grp-label">
          Codice di un amico
          <span className="afd-row">
            <input
              type="text"
              className={`grp-field grp-field--code afd-field${result && !result.ok ? " is-error" : ""}`}
              value={code}
              onChange={(e) => {
                setCode(formatInviteCode(e.target.value));
                setResult(null);
              }}
              maxLength={9}
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX"
              aria-describedby={result ? "afd-result" : undefined}
            />
            <button type="submit" className="grp-btn" disabled={saving || !ready}>
              Invia richiesta
            </button>
          </span>
        </label>
        {result && (
          <div id="afd-result" className={result.ok ? "grp-ok" : "grp-error-box"} role={result.ok ? "status" : "alert"}>
            {!result.ok && <AlertIcon />}
            <span>{result.text}</span>
          </div>
        )}
      </form>

      {error && (
        <div className="grp-error-box" role="alert">
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}

      {received.length > 0 && (
        <section className="afd-section" aria-label="Richieste ricevute">
          <h3 className="afd-cap">Ricevute</h3>
          <ul className="afd-list">
            {received.map((r) => (
              <li key={r.userId} className="afd-req">
                <FriendAvatar userId={r.userId} small />
                <span className="afd-req-text">
                  <b>{r.username}</b>
                  <span>{listTime(r.createdAt, now)}</span>
                </span>
                <button type="button" className="grp-btn grp-btn--sm" onClick={() => void run(() => answerRequest(r.userId, true))}>
                  Accetta
                </button>
                <button
                  type="button"
                  className="grp-btn grp-btn--ghost grp-btn--sm"
                  onClick={() => void run(() => answerRequest(r.userId, false))}
                >
                  Rifiuta
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sent.length > 0 && (
        <section className="afd-section" aria-label="Richieste inviate">
          <h3 className="afd-cap">Inviate</h3>
          <ul className="afd-list">
            {sent.map((r) => (
              <li key={r.userId} className="afd-req">
                <FriendAvatar userId={r.userId} small />
                <span className="afd-req-text">
                  <b>{r.username}</b>
                  <span>in attesa · {listTime(r.createdAt, now)}</span>
                </span>
                <button type="button" className="grp-btn grp-btn--ghost grp-btn--sm" onClick={() => void run(() => cancelRequest(r.userId))}>
                  Annulla
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grp-actions">
        <button type="button" className="grp-btn grp-btn--ghost" onClick={onClose}>
          Chiudi
        </button>
      </div>
    </GroupsDialog>
  );
}

export default AddFriendDialog;
