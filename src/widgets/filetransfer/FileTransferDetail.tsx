import { useEffect, useState } from "react";
import { MdOutlineFolderOpen, MdRefresh } from "react-icons/md";
import { QRCodeSVG } from "qrcode.react";
import { useNav } from "../../core/nav/useNav";
import { useThemeVariant } from "../../core/theme/variants";
import BackButton from "../../ui/BackButton";
import { useFileTransfer } from "./useFileTransfer";
import { readPreview, type Preview } from "./data/fileTransferApi";
import { extensionOf, formatDate, formatSize } from "./lib/format";
import { STATUS_LABELS } from "./lib/labels";
import "./FileTransferDetail.css";

/** Pagina a schermo intero: controllo del server, QR di collegamento, file ricevuti e anteprima. */
function FileTransferDetail() {
  const { goToDashboard } = useNav();
  const { running, address, port, busy, error, files, ready, startServer, stopServer, refreshFiles, openFolder, clearError } =
    useFileTransfer();

  const [onLabel, offLabel] = useThemeVariant(STATUS_LABELS);

  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Carica l'anteprima del file selezionato. `cancelled` evita che una
  // risposta lenta sovrascriva quella del file scelto dopo.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    readPreview(selected)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((e) => {
        if (!cancelled) setPreviewError(String(e));
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const selectedExists = selected !== null && files.some((f) => f.name === selected);

  return (
    <div className="ft-detail">
      <header className="dashboard-header ft-detail-header">
        <div>
          <h1>File Transfer</h1>
          <p>Ricevi file dal dispositivo sulla rete locale.</p>
        </div>
        <BackButton onClick={goToDashboard} />
      </header>

      {/* Il server con i pezzi della card File del tema: numero grande, punto di stato, pulsanti. */}
      <section className={`ft-card ft-server${running ? " is-online" : ""}`}>
        <div className="ft-server-main">
          <div className="ft-server-head">
            <h2>Server</h2>
            <span className="ft-status">
              <span className="ft-dot" aria-hidden="true" />
              {running ? onLabel : offLabel}
            </span>
          </div>

          <div className="ft-count">
            <span className="ft-num">{ready ? files.length : "–"}</span>
            <span className="ft-count-label">{files.length === 1 ? "file ricevuto" : "file ricevuti"}</span>
          </div>

          <p className="ft-muted">
            {running
              ? "Pronto a ricevere file dai dispositivi sulla stessa rete Wi-Fi."
              : "Avvia il server per permettere all'iPad di collegarsi."}
          </p>

          {running && address && (
            <div className="ft-address">
              <span>Indirizzo da aprire sul dispositivo</span>
              <code>http://{address}</code>
            </div>
          )}

          <div className="ft-buttons">
            <button type="button" className="ft-btn ft-btn--primary" onClick={() => void startServer()} disabled={busy || running || !ready}>
              {busy && !running ? "Avvio…" : "Avvia server"}
            </button>
            <button type="button" className="ft-btn ft-btn--danger" onClick={() => void stopServer()} disabled={busy || !running}>
              Ferma server
            </button>
          </div>

          {error && (
            <div className="ft-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={clearError} aria-label="Chiudi errore">
                ✕
              </button>
            </div>
          )}
        </div>

        <div className="ft-server-side">
          <dl className="ft-info">
            <dt>Porta</dt>
            <dd>{port}</dd>
            <dt>Protocollo</dt>
            <dd>HTTP</dd>
          </dl>

          {running && address && (
            <div className="ft-qr">
              {/* Il QR resta scuro su chiaro in ogni tema: i lettori lo richiedono. */}
              <div className="ft-qr-code">
                <QRCodeSVG value={`http://${address}/`} size={120} level="M" bgColor="transparent" fgColor="currentColor" />
              </div>
              <span className="ft-muted">Inquadralo con l'iPad per collegarti.</span>
            </div>
          )}
        </div>
      </section>

      <section className="ft-grid">
        <div className="ft-card ft-files">
          <div className="ft-card-heading">
            <h2>File ricevuti</h2>
            <div className="ft-buttons">
              <button type="button" className="ft-btn ft-btn--small" onClick={() => void refreshFiles()} title="Aggiorna l'elenco">
                <MdRefresh /> Aggiorna
              </button>
              <button type="button" className="ft-btn ft-btn--small" onClick={() => void openFolder()} title="Apri la cartella in Esplora file">
                <MdOutlineFolderOpen /> Apri cartella
              </button>
            </div>
          </div>

          {files.length === 0 ? (
            <div className="ft-empty">
              <strong>Nessun file ricevuto</strong>
              <span>I file inviati dal dispositivo appariranno qui.</span>
            </div>
          ) : (
            <ul className="ft-file-list">
              {files.map((file) => (
                <li key={file.name}>
                  <button
                    type="button"
                    className={`ft-file-row${file.name === selected ? " is-selected" : ""}`}
                    onClick={() => setSelected(file.name)}
                  >
                    <span className="ft-file-icon">{extensionOf(file.name).slice(0, 4)}</span>
                    <span className="ft-file-details">
                      <span className="ft-file-name">{file.name}</span>
                      <span className="ft-file-meta">
                        {formatSize(file.size)} · {formatDate(file.modified)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ft-card ft-preview">
          <div className="ft-card-heading">
            <h2>Anteprima</h2>
            {selected && <span className="ft-preview-name">{selected}</span>}
          </div>

          {(!selected || !selectedExists) && (
            <div className="ft-empty">
              <strong>Nessun file selezionato</strong>
              <span>Seleziona un file per vederne l'anteprima.</span>
            </div>
          )}

          {selected && selectedExists && previewLoading && <p className="ft-muted">Caricamento anteprima…</p>}
          {selected && selectedExists && previewError && <p className="ft-form-error">{previewError}</p>}

          {selected && selectedExists && preview?.kind === "text" && (
            <>
              <pre className="ft-preview-text">{preview.content}</pre>
              {preview.truncated && <p className="ft-muted">Anteprima limitata ai primi 50 KB.</p>}
            </>
          )}

          {selected && selectedExists && preview?.kind === "image" && (
            <div className="ft-image-frame">
              <img src={`data:${preview.mime};base64,${preview.base64}`} alt={selected} />
            </div>
          )}

          {selected && selectedExists && preview?.kind === "unsupported" && (
            <div className="ft-empty">
              <span className="ft-file-icon ft-file-icon--big">{extensionOf(selected).slice(0, 4)}</span>
              <strong>Anteprima non disponibile</strong>
              <span>
                File {preview.extension || "senza estensione"} · {formatSize(preview.size)}
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default FileTransferDetail;
