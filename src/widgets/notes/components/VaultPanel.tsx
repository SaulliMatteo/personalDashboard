import { useEffect } from "react";
import { MdClose } from "react-icons/md";

interface VaultPanelProps {
  enabled: boolean;
  busy: boolean;
  pathLabel: string;
  onToggle: (enabled: boolean) => void;
  onSyncAll: () => void;
  onImport: () => void;
  onOpenFolder: () => void;
  onClose: () => void;
}

/** Gestione della copia su disco (Markdown + JSON) delle note. */
function VaultPanel({ enabled, busy, pathLabel, onToggle, onSyncAll, onImport, onOpenFolder, onClose }: VaultPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="nq-modal-overlay" onClick={onClose}>
      <div className="nq-modal" role="dialog" aria-label="Cartella su disco" onClick={(e) => e.stopPropagation()}>
        <header className="nq-panel-head">
          <div>
            <h3>Cartella su disco</h3>
            <p>Le tue note anche come file aperti, sempre leggibili.</p>
          </div>
          <button type="button" className="nq-icon-btn" onClick={onClose} aria-label="Chiudi">
            <MdClose />
          </button>
        </header>

        <div className="nq-modal-body">
          <label className="nq-modal-toggle">
            <input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => onToggle(e.target.checked)} />
            <span>
              <strong>Tieni una copia su disco</strong>
              <em>Ogni nota diventa una cartella con <code>nota.md</code> (testo) e <code>canvas.json</code> (scrittura a mano, sfondo e formattazione).</em>
            </span>
          </label>

          <p className="nq-panel-hint">
            Posizione: <code>{pathLabel}</code>
            <br />
            L'app continua a lavorare sul suo database: la cartella è una copia che si aggiorna da sola a ogni modifica.
            I file allegati vivono nella sottocartella <code>allegati</code> di ogni nota.
          </p>

          <div className="nq-modal-actions">
            <button type="button" className="nq-btn" disabled={busy} onClick={onOpenFolder}>
              Apri la cartella
            </button>
            <button type="button" className="nq-btn" disabled={busy || !enabled} onClick={onSyncAll}>
              Riscrivi tutto
            </button>
            <button type="button" className="nq-btn" disabled={busy} onClick={onImport}>
              Importa dalla cartella
            </button>
          </div>

          <p className="nq-panel-hint">
            «Importa» aggiunge le note presenti su disco che l'app non conosce (per esempio dopo una reinstallazione, o file
            Markdown che hai scritto tu seguendo la stessa struttura). Non sovrascrive nulla di esistente.
          </p>
        </div>
      </div>
    </div>
  );
}

export default VaultPanel;
