import { useFtCell } from "./useFtCell";
import "./ftCell.css";
import "./FtCellQuaderno.css";

function wordOf(running: boolean, empty: boolean): string {
  if (!running) return "server spento";
  return empty ? "ancora nessun file" : "file ricevuti";
}

/** Quaderno, 1×1 "Foglio": un foglio a righe con la graffetta e il conteggio scritto a mano. */
function FtCellQuaderno() {
  const d = useFtCell();
  return (
    <article className={`widget ftc ftc-q${d.onlineClass}`} aria-label={d.ariaLabel} title={d.errorTitle}>
      <div className="ftc-q-sheet">
        <span className="ftc-title">File transfer</span>
        <span className="ftc-num">{d.count}</span>
        <span className="ftc-q-word">{wordOf(d.running, d.empty)}</span>
      </div>
      <svg className="ftc-q-clip" viewBox="0 0 16 34" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 8v17a4 4 0 0 0 8 0V6a3 3 0 0 0-6 0v18a1.5 1.5 0 0 0 3 0V9" />
      </svg>
      <span className="ftc-st ftc-q-st">
        <span className="ftc-dot" aria-hidden="true" />
        <span className="ftc-q-st-label">{d.statusLabel}</span>
      </span>
    </article>
  );
}

export default FtCellQuaderno;
