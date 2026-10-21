import { useEffect, useState } from "react";
import { MdCheck, MdClose, MdOutlineCreateNewFolder } from "react-icons/md";
import ConfirmButton from "../../../ui/ConfirmButton";
import type { Folder } from "../data/notesRepository";
import { FOLDER_COLORS, FOLDER_ICONS, folderIcon } from "../lib/folders";

interface FolderPanelProps {
  folder: Folder;
  /** Nome della cartella che la contiene (null = radice), per l'anteprima. */
  parentName: string | null;
  noteCount: number;
  onSave: (patch: { name: string; color: string | null; icon: string }) => void;
  onAddSubfolder: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Pannello laterale per cambiare nome, colore e icona di una cartella. */
function FolderPanel({ folder, parentName, noteCount, onSave, onAddSubfolder, onDelete, onClose }: FolderPanelProps) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<string | null>(folder.color);
  const [icon, setIcon] = useState(folder.icon);

  // Cambiando cartella selezionata il pannello riparte dai suoi valori.
  useEffect(() => {
    setName(folder.name);
    setColor(folder.color);
    setIcon(folder.icon);
  }, [folder.id, folder.name, folder.color, folder.icon]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Icon = folderIcon(icon);
  const tint = color ?? "var(--accent)";
  const colorLabel = FOLDER_COLORS.find((c) => c.value === color)?.label ?? (color ? "Personalizzato" : "Predefinito");
  const canSave = name.trim().length > 0;

  return (
    <aside className="nq-panel">
      <header className="nq-panel-head">
        <div>
          <h3>Personalizza cartella</h3>
          <p>Un posto riconoscibile per le tue idee.</p>
        </div>
        <button type="button" className="nq-icon-btn" onClick={onClose} aria-label="Chiudi">
          <MdClose />
        </button>
      </header>

      <div className="nq-panel-body">
        <label className="nq-panel-field">
          <span className="nq-panel-label">Nome della cartella</span>
          <input
            className="nq-input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) onSave({ name: name.trim(), color, icon });
            }}
          />
        </label>

        <div className="nq-panel-field">
          <div className="nq-panel-labelrow">
            <span className="nq-panel-label">Colore</span>
            <span className="nq-panel-hint">{colorLabel}</span>
          </div>
          <div className="nq-swatches">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`nq-swatch${color === c.value ? " is-on" : ""}`}
                style={{ background: c.value }}
                onClick={() => setColor(c.value)}
                aria-label={c.label}
                title={c.label}
              >
                {color === c.value && <MdCheck />}
              </button>
            ))}
          </div>
          <label className="nq-custom-color">
            <input type="color" value={color ?? "#6c8dff"} onChange={(e) => setColor(e.target.value)} />
            <span>Colore personalizzato</span>
            <span className="nq-panel-hint">{(color ?? "—").toUpperCase()}</span>
          </label>
        </div>

        <div className="nq-panel-field">
          <span className="nq-panel-label">Icona</span>
          <p className="nq-panel-hint">Un piccolo segno per ritrovarla al volo.</p>
          <div className="nq-icon-grid">
            {FOLDER_ICONS.map(({ key, Icon: Choice }) => (
              <button
                key={key}
                type="button"
                className={`nq-icon-choice${icon === key ? " is-on" : ""}`}
                onClick={() => setIcon(key)}
                aria-label={`Icona ${key}`}
              >
                <Choice />
              </button>
            ))}
          </div>
        </div>

        <div className="nq-panel-field">
          <span className="nq-panel-label nq-panel-label--muted">Anteprima</span>
          <div className="nq-preview">
            <span className="nq-preview-icon" style={{ color: tint, background: `color-mix(in srgb, ${tint} 16%, transparent)` }}>
              <Icon />
            </span>
            <div>
              <strong>{name.trim() || "Senza nome"}</strong>
              <span>
                {noteCount} documenti{parentName ? ` · ${parentName}` : ""}
              </span>
            </div>
          </div>
          <p className="nq-panel-hint">Le modifiche si applicano alla cartella, non ai documenti al suo interno.</p>
        </div>

        <div className="nq-panel-field nq-panel-extra">
          <button type="button" className="nq-btn" onClick={onAddSubfolder}>
            <MdOutlineCreateNewFolder /> Aggiungi sottocartella
          </button>
          <ConfirmButton
            className="nq-btn nq-btn--danger"
            label="Elimina cartella"
            confirmLabel="Le note vanno nel cestino. Sicuro?"
            onConfirm={onDelete}
          />
        </div>
      </div>

      <footer className="nq-panel-foot">
        <button type="button" className="nq-btn" onClick={onClose}>
          Annulla
        </button>
        <button
          type="button"
          className="nq-btn nq-btn--primary"
          disabled={!canSave}
          onClick={() => onSave({ name: name.trim(), color, icon })}
        >
          <MdCheck /> Salva modifiche
        </button>
      </footer>
    </aside>
  );
}

export default FolderPanel;
