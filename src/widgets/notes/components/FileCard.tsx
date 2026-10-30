import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { MdDeleteOutline, MdOutlineFolderOpen } from "react-icons/md";
import { extensionOf } from "../lib/attachmentUrls";
import { formatBytes } from "../lib/insertFiles";
import { attachmentAbsolutePath } from "../lib/vault";
import "./FileCard.css";

interface FileCardProps {
  block: HTMLElement;
  noteDir: string | null;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onError: (message: string) => void;
}

/** Un file nella pagina (<div data-block="file">): si apre col programma del sistema. */
function FileCard({ block, noteDir, selected, onSelect, onDelete, onError }: FileCardProps) {
  const name = block.dataset.attachment ?? "";
  const bytes = Number(block.dataset.bytes ?? 0);
  const ext = extensionOf(name).toUpperCase().slice(0, 4) || "FILE";

  async function withPath(action: (path: string) => Promise<void>, failure: string) {
    if (!noteDir) {
      onError("La copia su disco non è ancora pronta, riprova tra un attimo");
      return;
    }
    try {
      await action(await attachmentAbsolutePath(noteDir, name));
    } catch (error) {
      console.error(`${failure}:`, error);
      onError(failure);
    }
  }

  return (
    <div
      className="nq-file"
      data-pdf={ext === "PDF" ? "" : undefined}
      onPointerDown={() => {
        if (!selected) onSelect();
      }}
    >
      <span className="nq-file-ico" aria-hidden="true">
        {ext}
      </span>
      <div className="nq-file-info">
        <b title={name}>{name}</b>
        <small>{bytes > 0 ? formatBytes(bytes) : "File allegato"}</small>
      </div>
      <button type="button" className="nq-btn nq-btn--small" onClick={() => void withPath(openPath, "Impossibile aprire il file")}>
        Apri
      </button>
      <button
        type="button"
        className="nq-icon-btn"
        onClick={() => void withPath((p) => revealItemInDir(p), "Impossibile mostrare il file nella cartella")}
        aria-label={`Mostra ${name} nella cartella`}
        title="Mostra nella cartella"
      >
        <MdOutlineFolderOpen />
      </button>
      {selected && (
        <button type="button" className="nq-icon-btn" onClick={onDelete} aria-label={`Togli ${name} dalla pagina`} title="Togli dalla pagina (resta negli allegati)">
          <MdDeleteOutline />
        </button>
      )}
    </div>
  );
}

export default FileCard;
