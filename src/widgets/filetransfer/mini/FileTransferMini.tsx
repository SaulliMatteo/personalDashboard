import { useThemeVariant } from "../../../core/theme/variants";
import { useFileTransfer } from "../useFileTransfer";
import { ROLE_TEXT, STATUS_LABELS } from "../lib/labels";
import "./FileTransferMini.css";

/** Mini da intestazione: file ricevuti nel font display e stato del server. */
function FileTransferMini() {
  const { role, running, files, ready } = useFileTransfer();
  const text = ROLE_TEXT[role];
  const [onLabel, offLabel] = useThemeVariant(STATUS_LABELS);
  const count = ready ? files.length : "–";
  return (
    <div className={`ft-mini${running ? " is-online" : ""}`} aria-label={`File transfer: ${count} ${text.countLong}, ${running ? "online" : "offline"}`}>
      <span className="ft-mini-num" aria-hidden="true">{count}</span>
      <span className="ft-mini-text" aria-hidden="true">
        <span>{text.countLong}</span>
        <span className="ft-mini-status">
          <span className="ft-mini-dot" />
          {running ? onLabel : offLabel}
        </span>
      </span>
    </div>
  );
}

export default FileTransferMini;
