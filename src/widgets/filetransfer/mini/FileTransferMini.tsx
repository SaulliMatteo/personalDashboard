import { useThemeVariant } from "../../../core/theme/variants";
import { useFileTransfer } from "../useFileTransfer";
import { STATUS_LABELS } from "../lib/labels";
import "./FileTransferMini.css";

/** Mini da intestazione: file ricevuti nel font display e stato del server. */
function FileTransferMini() {
  const { running, files, ready } = useFileTransfer();
  const [onLabel, offLabel] = useThemeVariant(STATUS_LABELS);
  const count = ready ? files.length : "–";
  return (
    <div className={`ft-mini${running ? " is-online" : ""}`} aria-label={`File transfer: ${count} file ricevuti, ${running ? "online" : "offline"}`}>
      <span className="ft-mini-num" aria-hidden="true">{count}</span>
      <span className="ft-mini-text" aria-hidden="true">
        <span>file ricevuti</span>
        <span className="ft-mini-status">
          <span className="ft-mini-dot" />
          {running ? onLabel : offLabel}
        </span>
      </span>
    </div>
  );
}

export default FileTransferMini;
