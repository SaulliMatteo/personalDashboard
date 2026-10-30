import { createElement, type MouseEvent } from "react";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { useThemeVariant } from "../../core/theme/variants";
import { PlayIcon, StopIcon } from "../../ui/icons";
import { useFileTransfer } from "./useFileTransfer";
import { extensionOf, formatSize } from "./lib/format";
import { STATUS_LABELS } from "./lib/labels";
import { FT_CELLS } from "./card/cards";
import "./FileTransferWidget.css";

const LATEST_FILES = 3;

// Etichetta dello stato: in Fosforo è da display ("On"), negli altri temi per esteso.
// Raggio degli angoli dell'icona "ferma", come nei mockup.
const STOP_ROUND = { notte: 2, opaco: 3, quaderno: 2, fosforo: 0 };

/**
 * Card del File transfer (temi-dashboard/docs/design/temi/*.html): in 2×1 e
 * 2×2 la struttura è la stessa in tutti i temi, cambiano font e colori (CSS).
 * La 1×1 ha una forma per tema (card/cards.ts).
 */
function FileTransferWidget({ w, h }: WidgetProps) {
  const { running, address, busy, files, ready, startServer, stopServer } = useFileTransfer();
  const [onLabel, offLabel] = useThemeVariant(STATUS_LABELS);
  const stopRound = useThemeVariant(STOP_ROUND);
  const Cell = useThemeVariant(FT_CELLS);
  const size = sizeKey(w, h);
  const count = ready ? files.length : "–";

  function handleToggle(e: MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    void (running ? stopServer() : startServer());
  }

  if (size === "S") {
    return <WidgetFrame>{createElement(Cell)}</WidgetFrame>;
  }

  const toggleLabel = running ? "Ferma il server" : "Avvia il server";
  return (
    <WidgetFrame>
      <article className={`widget ftw ftw--${size}${running ? " is-online" : ""}`}>
        <header className="ftw-head">
          <span className="ftw-title">File</span>
          <span className="ftw-status">
            <span className="ftw-dot" aria-hidden="true" />
            {running ? onLabel : offLabel}
          </span>
        </header>

        <div className="ftw-main">
          <div>
            <div className="ftw-num">{count}</div>
            <div className="ftw-label">ricevuti</div>
          </div>
          <div className="ftw-side">
            <span className="ftw-address">{running && address ? `http://${address}` : "Server fermo"}</span>
            <button type="button" className="ftw-toggle" onClick={handleToggle} disabled={busy} aria-label={toggleLabel} title={toggleLabel}>
              {running ? <StopIcon size={13} round={stopRound} /> : <PlayIcon size={15} />}
            </button>
          </div>
        </div>

        {size === "M" && (
          <ul className="ftw-files">
            {files.length === 0 ? (
              <li className="ftw-files-empty">I file inviati dal dispositivo appariranno qui.</li>
            ) : (
              files.slice(0, LATEST_FILES).map((file) => (
                <li key={file.name}>
                  <span className="ftw-file-name">{file.name}</span>
                  <span className="ftw-file-meta">
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
