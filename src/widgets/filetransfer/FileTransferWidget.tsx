import type { MouseEvent } from "react";
import { MdOutlineInsertDriveFile, MdPlayArrow, MdStop } from "react-icons/md";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { useFileTransfer } from "./FileTransferContext";
import { extensionOf, formatSize } from "./lib/format";
import "./FileTransferWidget.css";

const LATEST_FILES_IN_LARGE = 3;

function FileTransferWidget({ w, h }: WidgetProps) {
  const { running, address, busy, files, ready, startServer, stopServer } = useFileTransfer();

  const isWide = w >= 2;
  const isLarge = w >= 2 && h >= 2;

  // Il click sul widget apre la pagina di dettaglio: i controlli lo fermano.
  function handleToggle(e: MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    void (running ? stopServer() : startServer());
  }

  const toggle = (
    <button
      type="button"
      className={`ft-widget-toggle${running ? " is-running" : ""}`}
      onClick={handleToggle}
      disabled={busy}
      aria-label={running ? "Ferma il server" : "Avvia il server"}
      title={running ? "Ferma il server" : "Avvia il server"}
    >
      {running ? <MdStop /> : <MdPlayArrow />}
    </button>
  );

  const statusLabel = running ? "Online" : "Offline";

  return (
    <WidgetFrame>
      <article className={`widget ft-widget ${isLarge ? "ft-widget--large" : isWide ? "ft-widget--wide" : "ft-widget--small"}`}>
        <div className="widget-header ft-widget-header">
          <h2>File Transfer</h2>
          <span className={`ft-status${running ? " is-online" : ""}`}>
            <span className="ft-status-dot" />
            {statusLabel}
          </span>
        </div>

        {!isWide ? (
          <div className="ft-widget-small-body">
            <div className="ft-widget-count">{ready ? files.length : "–"}</div>
            <p className="ft-widget-caption">file ricevuti</p>
            {toggle}
          </div>
        ) : (
          <div className="ft-widget-main">
            <div className="ft-widget-info">
              <div className="ft-widget-count">{ready ? files.length : "–"}</div>
              <p className="ft-widget-caption">file ricevuti</p>
            </div>
            <div className="ft-widget-side">
              {running && address ? <code className="ft-widget-address">http://{address}</code> : <span className="ft-widget-hint">Server fermo</span>}
              {toggle}
            </div>
          </div>
        )}

        {isLarge && (
          <ul className="ft-widget-files">
            {files.length === 0 ? (
              <li className="ft-widget-empty">I file inviati dall'iPad appariranno qui.</li>
            ) : (
              files.slice(0, LATEST_FILES_IN_LARGE).map((file) => (
                <li key={file.name}>
                  <MdOutlineInsertDriveFile className="ft-widget-file-icon" />
                  <span className="ft-widget-file-name">{file.name}</span>
                  <span className="ft-widget-file-meta">
                    {extensionOf(file.name)} · {formatSize(file.size)}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </article>
    </WidgetFrame>
  );
}

export default FileTransferWidget;
