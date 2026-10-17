import { useMemo, useState, type FormEvent } from "react";
import ConfirmButton from "../../../ui/ConfirmButton";
import { addFolder, deleteFolder, isUniqueViolation, moveFolder, renameFolder, setFolderColor, type VideoFolder } from "../data/youtubeRepository";
import { folderOptions } from "../lib/folderOptions";
import { FOLDER_FALLBACK_COLORS } from "../lib/library";
import Dialog from "./Dialog";

interface FolderDialogProps {
  /** Cartella da modificare; assente = crea una nuova. */
  folder?: VideoFolder;
  folders: VideoFolder[];
  /** Dove proporre di crearla (solo in creazione). */
  defaultParentId?: number | null;
  onClose: () => void;
  /** Dopo ogni modifica riuscita (il genitore rilegge i dati). `deleted` = la cartella non esiste più. */
  onDone: (result: { deleted?: boolean }) => void;
}

/** Crea o modifica una cartella: nome, colore, dove sta. In modifica si può anche eliminare (i video non si perdono). */
function FolderDialog({ folder, folders, defaultParentId = null, onClose, onDone }: FolderDialogProps) {
  const editing = folder !== undefined;
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState<string | null>(folder?.color ?? null);
  const [parentId, setParentId] = useState<number | null>(folder ? folder.parentId : defaultParentId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => folderOptions(folders, folder?.id ?? null), [folders, folder?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!folder) {
        await addFolder(trimmed, parentId, color);
      } else {
        // Prima lo spostamento: se fallisce (ciclo) o il nome esiste già, non resta una modifica a metà più del necessario.
        if (parentId !== folder.parentId) await moveFolder(folder.id, parentId);
        if (trimmed !== folder.name) await renameFolder(folder.id, trimmed);
        if (color !== folder.color) await setFolderColor(folder.id, color);
      }
      onDone({});
      onClose();
    } catch (err) {
      setError(isUniqueViolation(err) ? `Esiste già una cartella "${trimmed}" in quel livello.` : err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Dialog title={editing ? "Modifica cartella" : "Nuova cartella"} onClose={onClose}>
      <form className="yt-dialog-body" onSubmit={(e) => void submit(e)}>
        <label className="yt-field">
          <span className="yt-label">NOME</span>
          <input className="yt-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Analisi, Elettronica…" maxLength={80} />
        </label>

        <label className="yt-field">
          <span className="yt-label">DOVE</span>
          <select className="yt-input" value={parentId === null ? "" : String(parentId)} onChange={(e) => setParentId(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">Primo livello</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                dentro: {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="yt-field">
          <span className="yt-label">COLORE</span>
          <div className="yt-swatches">
            <button type="button" className={`yt-swatch yt-swatch--auto${color === null ? " is-selected" : ""}`} onClick={() => setColor(null)} title="Automatico" aria-label="Colore automatico">
              A
            </button>
            {FOLDER_FALLBACK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`yt-swatch${color === c ? " is-selected" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Colore ${c}`}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="yt-banner yt-banner--error" role="alert">
            <span>{error}</span>
          </div>
        )}

        <div className="yt-dialog-actions">
          {folder && (
            <ConfirmButton
              className="yt-btn yt-btn--danger yt-dialog-delete"
              label="Elimina"
              confirmLabel="Sicuro? Anche le sottocartelle"
              onConfirm={async () => {
                try {
                  await deleteFolder(folder.id);
                  onDone({ deleted: true });
                  onClose();
                } catch (err) {
                  setError(String(err));
                }
              }}
            />
          )}
          <span className="yt-spacer" />
          <button type="button" className="yt-btn" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="yt-btn yt-btn--primary" disabled={!name.trim() || busy}>
            {editing ? "Salva" : "Crea"}
          </button>
        </div>
        {folder && <p className="yt-muted">Eliminando una cartella, i suoi video non si cancellano: tornano in "Senza cartella".</p>}
      </form>
    </Dialog>
  );
}

export default FolderDialog;
