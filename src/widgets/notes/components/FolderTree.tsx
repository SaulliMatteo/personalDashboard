import { useState, type ReactNode } from "react";
import { MdChevronRight, MdExpandMore, MdOutlineDescription } from "react-icons/md";
import type { Folder, NoteSummary } from "../data/notesRepository";
import { folderIcon } from "../lib/folders";

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
  const { childrenOf, counts, notesByFolder, expanded, selectedFolderId, openNoteId, newFolderParent } = props;

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
            <div className={`nq-tree-row${selected ? " is-active" : ""}`} style={{ paddingLeft: 10 + depth * INDENT }}>
              <button
                type="button"
                className="nq-tree-chevron"
                onClick={() => props.onToggle(folder.id)}
                aria-label={open ? "Comprimi" : "Espandi"}
              >
                {expandable ? open ? <MdExpandMore /> : <MdChevronRight /> : null}
              </button>
              <button type="button" className="nq-tree-main" onClick={() => props.onSelect(folder.id)}>
                <Icon className="nq-tree-icon" style={{ color: folder.color ?? undefined }} />
                <span className="nq-tree-name">{folder.name}</span>
                <span className="nq-tree-count">{counts.get(folder.id) ?? 0}</span>
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
                    >
                      <MdOutlineDescription />
                      <span className="nq-tree-name">{note.title || "Senza titolo"}</span>
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
