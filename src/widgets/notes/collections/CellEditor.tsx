import { useState, type KeyboardEvent } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { MdClose, MdOpenInNew, MdOutlineAttachFile } from "react-icons/md";
import { type CellValue, type Field, type FileValue } from "../lib/collections";
import { baseName, collectionFilePath, saveCollectionFile } from "../lib/vault";
import ChoicePicker from "./ChoicePicker";
import "./CellEditor.css";

export interface NoteRef {
  id: number;
  title: string;
}

interface CellEditorProps {
  field: Field;
  value: CellValue;
  onChange: (value: CellValue) => void;
  /** Note vive (per i campi "nota"). */
  notes: NoteRef[];
  onOpenNote: (id: number) => void;
  onNotice: (message: string) => void;
}

const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Campo di testo che salva all'uscita (o con Invio); Esc torna al valore di prima. */
function TextInput({ value, label, inputMode, onCommit }: { value: string; label: string; inputMode?: "decimal" | "url"; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setDraft(null);
      e.stopPropagation();
      requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur());
    }
  }
  return (
    <input
      className="nq-cell-input"
      value={shown}
      aria-label={label}
      inputMode={inputMode}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={keyDown}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
    />
  );
}

/** L'editor giusto per il tipo del campo. */
function CellEditor({ field, value, onChange, notes, onOpenNote, onNotice }: CellEditorProps) {
  const label = field.name;
  switch (field.type) {
    case "text":
      return <TextInput value={typeof value === "string" ? value : ""} label={label} onCommit={(v) => onChange(v)} />;
    case "number":
      return (
        <TextInput
          value={typeof value === "number" ? String(value).replace(".", ",") : ""}
          label={label}
          inputMode="decimal"
          onCommit={(v) => {
            if (v.trim() !== "" && !Number.isFinite(Number(v.replace(",", ".")))) onNotice("Scrivi un numero (es. 7,5)");
            else onChange(v);
          }}
        />
      );
    case "url": {
      const url = typeof value === "string" ? value : "";
      return (
        <span className="nq-cell-row">
          <TextInput value={url} label={label} inputMode="url" onCommit={(v) => onChange(v.trim())} />
          {/^(https?:|mailto:)/i.test(url) && (
            <button type="button" className="nq-cell-mini" aria-label="Apri il link" title="Apri il link" onClick={() => void openUrl(url).catch(() => onNotice("Impossibile aprire il link"))}>
              <MdOpenInNew />
            </button>
          )}
        </span>
      );
    }
    case "date":
      return (
        <input
          type="date"
          className="nq-cell-input nq-cell-date"
          aria-label={label}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "check":
      return <input type="checkbox" className="nq-cell-checkbox" aria-label={label} checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case "select":
    case "multi":
      return <ChoicePicker field={field} value={value} onChange={onChange} onNotice={onNotice} />;
    case "note": {
      const id = typeof value === "number" ? value : null;
      const missing = id !== null && !notes.some((n) => n.id === id);
      return (
        <span className="nq-cell-row">
          <select className="nq-cell-select nq-cell-select--plain" aria-label={label} value={id ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {missing && <option value={id ?? ""}>Nota eliminata</option>}
            {notes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title || "Senza titolo"}
              </option>
            ))}
          </select>
          {id !== null && !missing && (
            <button type="button" className="nq-cell-mini" aria-label="Apri la nota" title="Apri la nota" onClick={() => onOpenNote(id)}>
              <MdOpenInNew />
            </button>
          )}
        </span>
      );
    }
    case "file":
      return <FileEditor field={field} value={value && typeof value === "object" && !Array.isArray(value) ? value : null} onChange={onChange} onNotice={onNotice} />;
  }
}

function FileEditor({ field, value, onChange, onNotice }: { field: Field; value: FileValue | null; onChange: (v: CellValue) => void; onNotice: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function pick() {
    try {
      const picked = await openDialog({ multiple: false });
      if (!picked || Array.isArray(picked)) return;
      setBusy(true);
      const bytes = await readFile(picked);
      if (bytes.length > MAX_FILE_BYTES) {
        onNotice("Il file supera i 50 MB");
        return;
      }
      const name = await saveCollectionFile(field.collectionId, baseName(picked), bytes);
      onChange({ name, size: bytes.length });
    } catch (error) {
      console.error("File non aggiunto:", error);
      onNotice("Impossibile aggiungere il file");
    } finally {
      setBusy(false);
    }
  }
  if (!value) {
    return (
      <button type="button" className="nq-cell-file" disabled={busy} onClick={() => void pick()} aria-label={`Scegli un file: ${field.name}`}>
        <MdOutlineAttachFile aria-hidden="true" /> {busy ? "Copio…" : "Scegli…"}
      </button>
    );
  }
  return (
    <span className="nq-cell-row">
      <button
        type="button"
        className="nq-cell-file"
        title="Apri il file"
        onClick={() =>
          void collectionFilePath(field.collectionId, value.name)
            .then(openPath)
            .catch(() => onNotice("Impossibile aprire il file"))
        }
      >
        <MdOutlineAttachFile aria-hidden="true" /> {value.name}
      </button>
      <button type="button" className="nq-cell-mini" aria-label="Togli il file" title="Togli il file" onClick={() => onChange(null)}>
        <MdClose />
      </button>
    </span>
  );
}

export default CellEditor;
