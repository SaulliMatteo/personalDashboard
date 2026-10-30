import { useState, type PointerEvent, type ReactNode } from "react";
import { MdAdd, MdChevronRight, MdExpandMore, MdOutlineDescription } from "react-icons/md";
import type { Folder, NoteSummary } from "../data/notesRepository";
import type { DragItem } from "../lib/drag";
import { folderIcon } from "../lib/folders";
import NoteTitle from "./NoteTitle";

interface FolderTreeProps {
  childrenOf: Map<number | null, Folder[]>;
  /** Note vive (anche nelle sottocartelle) per ogni cartella. */
  counts: Map<number, number>;
  /** Note contenute direttamente in ogni cartella. */
  notesByFolder: Map<number, NoteSummary[]>;
  selectedFolderId: number | null;
  expanded: Set<number>;
  openNoteId: number | null;
  /** undefined = nessuna creazione in corso; null = in radice; numero = dentro quella cartella. */
  newFolderParent: number | null | undefined;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onOpenNote: (id: number) => void;
  onCreateFolder: (name: string, parentId: number | null) => void;
  onCancelCreate: () => void;
  /** Bersaglio di rilascio evidenziato durante un trascinamento ("root" o id cartella). */
  dropKey: string | null;
  onDragStart: (e: PointerEvent<HTMLElement>, item: DragItem) => void;
  onAddSubfolder: (id: number) => void;
}

const INDENT = 16;

function NewFolderInput({
  depth,
  onSubmit,
  onCancel,
}: {
  depth: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="nq-tree-row" style={{ paddingLeft: 10 + depth * INDENT + 22 }}>
      <input
        autoFocus
        className="nq-tree-input"
        value={name}
        placeholder="Nome cartella…"
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) onSubmit(name.trim());
          if (e.key === "Escape") onCancel();
        }}
        onBlur={onCancel}
      />
    </div>
  );
}

function FolderTree(props: FolderTreeProps) {
  const { childrenOf, counts, notesByFolder, expanded, selectedFolderId, openNoteId, newFolderParent, dropKey } = props;

  const renderLevel = (parentId: number | null, depth: number): ReactNode => (
    <>
      {(childrenOf.get(parentId) ?? []).map((folder) => {
        const open = expanded.has(folder.id);
        const subfolders = childrenOf.get(folder.id) ?? [];
        const selected = selectedFolderId === folder.id;
        const direct = notesByFolder.get(folder.id) ?? [];
        const expandable = subfolders.length > 0 || direct.length > 0 || newFolderParent === folder.id;
        const Icon = folderIcon(folder.icon);

        return (
          <div key={folder.id}>
            <div
              className={`nq-tree-row${selected ? " is-active" : ""}${dropKey === String(folder.id) ? " is-drop" : ""}`}
              data-drop-folder={folder.id}
              style={{ paddingLeft: 10 + depth * INDENT }}
            >
              <button
                type="button"
                className="nq-tree-chevron"
                onClick={() => props.onToggle(folder.id)}
                aria-label={open ? "Comprimi" : "Espandi"}
              >
                {expandable ? open ? <MdExpandMore /> : <MdChevronRight /> : null}
              </button>
              <button
                type="button"
                className="nq-tree-main"
                onClick={() => props.onSelect(folder.id)}
                onPointerDown={(e) => props.onDragStart(e, { kind: "folder", id: folder.id, label: folder.name })}
              >
                <Icon className="nq-tree-icon" style={{ color: folder.color ?? undefined }} />
                <span className="nq-tree-name">{folder.name}</span>
                <span className="nq-tree-count">{counts.get(folder.id) ?? 0}</span>
              </button>
              <button
                type="button"
                className="nq-tree-add"
                onClick={() => props.onAddSubfolder(folder.id)}
                aria-label={`Nuova sottocartella in ${folder.name}`}
                title="Nuova sottocartella"
              >
                <MdAdd />
              </button>
            </div>

            {open && (
              <>
                {renderLevel(folder.id, depth + 1)}
                {newFolderParent === folder.id && (
                  <NewFolderInput
                    depth={depth + 1}
                    onSubmit={(name) => props.onCreateFolder(name, folder.id)}
                    onCancel={props.onCancelCreate}
                  />
                )}
                {selected &&
                  direct.slice(0, 3).map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      className={`nq-tree-note${openNoteId === note.id ? " is-active" : ""}`}
                      style={{ paddingLeft: 10 + (depth + 1) * INDENT + 22 }}
                      onClick={() => props.onOpenNote(note.id)}
                      onPointerDown={(e) => props.onDragStart(e, { kind: "note", id: note.id, label: note.title || "Senza titolo" })}
                    >
                      <MdOutlineDescription />
                      <NoteTitle className="nq-tree-name" color={note.titleColor} deps={[openNoteId === note.id]}>
                        {note.title || "Senza titolo"}
                      </NoteTitle>
                    </button>
                  ))}
                {selected && direct.length > 3 && (
                  <span className="nq-tree-more" style={{ paddingLeft: 10 + (depth + 1) * INDENT + 22 }}>
                    … Altri {direct.length - 3} documenti
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );

  return (
    <div className="nq-tree">
      {renderLevel(null, 0)}
      {newFolderParent === null && (
        <NewFolderInput depth={0} onSubmit={(name) => props.onCreateFolder(name, null)} onCancel={props.onCancelCreate} />
      )}
    </div>
  );
}

export default FolderTree;
