import { useState, type FormEvent } from "react";
import { MdOutlineFileUpload, MdRefresh } from "react-icons/md";
import { useNav } from "../../core/nav/useNav";
import BackButton from "../../ui/BackButton";
import { useFileSend, type Transfer } from "./useFileSend";
import { extensionOf, formatSize } from "./lib/format";
import "./FileTransferDetail.css";
import "./FileSendDetail.css";

function stateText(reachable: boolean | null, checking: boolean, address: string): string {
  if (!address) return "Da impostare";
  if (checking || reachable === null) return "Controllo…";
  return reachable ? "Raggiungibile" : "Non raggiungibile";
}

function transferText(t: Transfer): string {
  if (t.status === "waiting") return "In coda";
  if (t.status === "error") return t.message ?? "Non inviato";
  if (t.status === "done") return t.message && t.message !== t.name ? `Inviato come ${t.message}` : "Inviato";
  return t.total > 0 ? `${formatSize(t.sent)} di ${formatSize(t.total)}` : "Apro il file…";
}

/**
 * File Transfer su Android: il telefono invia al PC. Stessa struttura della pagina web dell'iPad
 * (Connessione, Invia file, Trasferimenti) con i pezzi del tema della pagina del desktop.
 */
function FileSendDetail() {
  const { goToDashboard } = useNav();
  const { ready, address, reachable, checking, error, transfers, sending, connect, check, pickAndSend, clearDone, clearError } =
    useFileSend();
  // la bozza parte dall'indirizzo ricordato; finché non la si tocca segue quello salvato
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? address;
  const online = Boolean(address) && reachable === true;
  const finished = transfers.some((t) => t.status === "done" || t.status === "error");

  function submit(e: FormEvent) {
    e.preventDefault();
    void connect(value).then(() => setDraft(null));
  }

  return (
    <div className="ft-detail fs-detail">
      <header className="dashboard-header ft-detail-header">
        <div>
          <h1>File Transfer</h1>
          <p>Invia file dal telefono al PC sulla stessa rete Wi-Fi.</p>
        </div>
        <BackButton onClick={goToDashboard} />
      </header>

      <section className={`ft-card fs-card${online ? " is-online" : ""}`}>
        <div className="ft-server-head">
          <div>
            <span className="fs-eyebrow">Connessione</span>
            <h2>PC</h2>
          </div>
          <span className="ft-status">
            <span className="ft-dot" aria-hidden="true" />
            {stateText(reachable, checking, address)}
          </span>
        </div>

        <form className="fs-address" onSubmit={submit}>
          <label className="fs-field">
            <span>Indirizzo del PC</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="192.168.1.20:5000"
              value={value}
              disabled={!ready}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <div className="ft-buttons">
            <button type="submit" className="ft-btn ft-btn--primary" disabled={!ready || checking || !value.trim()}>
              {draft !== null && draft.trim() !== address ? "Salva" : "Collega"}
            </button>
            {address && (
              <button type="button" className="ft-btn" onClick={() => void check()} disabled={checking} aria-label="Controlla di nuovo">
                <MdRefresh />
              </button>
            )}
          </div>
        </form>
        <p className="ft-muted">Sul PC apri File Transfer e premi “Avvia server”: l'indirizzo è quello che compare lì.</p>

        {error && (
          <div className="ft-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={clearError} aria-label="Chiudi errore">
              ✕
            </button>
          </div>
        )}
      </section>

      <section className="ft-card fs-card">
        <span className="fs-eyebrow">Trasferimento</span>
        <h2>Invia file</h2>
        <button type="button" className="fs-drop" onClick={() => void pickAndSend()} disabled={!ready || !address}>
          <MdOutlineFileUpload className="fs-drop-icon" aria-hidden="true" />
          <strong>Scegli file</strong>
          <span>{address ? "Puoi selezionarne più di uno contemporaneamente." : "Prima scrivi l'indirizzo del PC."}</span>
        </button>
        <div className="ft-buttons fs-send-row">
          <button type="button" className="ft-btn ft-btn--primary" onClick={() => void pickAndSend()} disabled={!ready || !address}>
            {sending ? "Aggiungi altri file" : "Seleziona i file"}
          </button>
        </div>
      </section>

      <section className="ft-card fs-card">
        <div className="ft-card-heading">
          <div>
            <span className="fs-eyebrow">Attività</span>
            <h2>Trasferimenti</h2>
          </div>
          {finished && (
            <button type="button" className="ft-btn ft-btn--small" onClick={clearDone}>
              Pulisci
            </button>
          )}
        </div>
        {transfers.length === 0 ? (
          <p className="ft-muted">Nessun trasferimento ancora.</p>
        ) : (
          <ul className="fs-list">
            {transfers.map((t) => (
              <li key={t.id} className={`fs-item is-${t.status}`}>
                <span className="ft-file-icon">{extensionOf(t.name).slice(0, 4)}</span>
                <span className="fs-item-body">
                  <span className="ft-file-name">{t.name}</span>
                  <span className="fs-bar" aria-hidden="true">
                    <i style={{ width: `${t.total > 0 ? Math.round((t.sent / t.total) * 100) : t.status === "done" ? 100 : 0}%` }} />
                  </span>
                  <span className="ft-file-meta" role={t.status === "error" ? "alert" : undefined}>
                    {transferText(t)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default FileSendDetail;
