import { useMemo, useState, type PointerEvent, type ReactNode } from "react";
import {
  MdAdd,
  MdDeleteOutline,
  MdExpandMore,
  MdOutlineGridView,
  MdOutlineRestoreFromTrash,
  MdOutlineStarBorder,
  MdOutlineTune,
  MdOutlineViewList,
  MdStar,
} from "react-icons/md";
import ConfirmButton from "../../../ui/ConfirmButton";
import type { NoteSummary } from "../data/notesRepository";
import type { DragItem } from "../lib/drag";
import { formatWhen, relativeDay, sanitizeHtml } from "../lib/html";
import { TEMPLATES } from "../lib/templates";

export type SortKey = "updated" | "created" | "title";
export type LayoutMode = "grid" | "list";

interface NoteCollectionProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  /** Colore dell'icona di intestazione (hex) o null. */
  accent: string | null;
  notes: NoteSummary[];
  /** Tutti i tag presenti nelle note mostrate (barra informativa). */
  tags: string[];
  pathOf: (folderId: number | null) => string;
  mode: LayoutMode;
  onMode: (mode: LayoutMode) => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  isTrash: boolean;
  onOpen: (id: number) => void;
  onToggleStar: (note: NoteSummary) => void;
  onTrash: (id: number) => void;
  onRestore: (id: number) => void;
  onDeleteForever: (id: number) => void;
  onEmptyTrash: () => void;
  /** Senza argomento = nota vuota; altrimenti l'id di un modello. */
  onNew: (templateId?: string) => void;
  /** Avvia il trascinamento di una nota verso una cartella. */
  onDragStart?: (e: PointerEvent<HTMLElement>, item: DragItem) => void;
  /** Presente solo per le cartelle. */
  onCustomize?: () => void;
}

const SORT_LABEL: Record<SortKey, string> = {
  updated: "Ultima modifica",
  created: "Data di creazione",
  title: "Titolo",
};

function sortNotes(notes: NoteSummary[], sort: SortKey): NoteSummary[] {
  const copy = [...notes];
  if (sort === "title") return copy.sort((a, b) => a.title.localeCompare(b.title, "it", { sensitivity: "base" }));
  if (sort === "created") return copy.sort((a, b) => b.createdAt - a.createdAt);
  return copy.sort((a, b) => b.updatedAt - a.updatedAt);
}

function NoteCollection(props: NoteCollectionProps) {
  const { notes, isTrash, mode } = props;
  const [tab, setTab] = useState<"all" | "starred">("all");
  const [templateMenu, setTemplateMenu] = useState(false);

  const visible = useMemo(() => {
    const filtered = tab === "starred" && !isTrash ? notes.filter((n) => n.starred) : notes;
    return sortNotes(filtered, props.sort);
  }, [notes, tab, isTrash, props.sort]);

  // Le anteprime si ripuliscono una volta per nota, non a ogni render.
  const previews = useMemo(() => new Map(notes.map((n) => [n.id, sanitizeHtml(n.firstContent)])), [notes]);

  function startNoteDrag(e: PointerEvent<HTMLElement>, note: NoteSummary) {
    if (isTrash || !props.onDragStart) return;
    if ((e.target as HTMLElement).closest(".nq-note-actions")) return; // stella, cestino, ecc.
    props.onDragStart(e, { kind: "note", id: note.id, label: note.title || "Senza titolo" });
  }

  const latest = notes.reduce((max, n) => Math.max(max, n.updatedAt), 0);

  return (
    <div className="nq-collection">
      <header className="nq-col-head">
        <span
          className="nq-col-icon"
          style={props.accent ? { color: props.accent, background: `color-mix(in srgb, ${props.accent} 16%, transparent)` } : undefined}
        >
          {props.icon}
        </span>
        <div className="nq-col-titles">
          <h1>{props.title}</h1>
          <p>{props.subtitle}</p>
        </div>
        <div className="nq-col-actions">
          {props.onCustomize && (
            <button type="button" className="nq-btn" onClick={props.onCustomize}>
              <MdOutlineTune /> Personalizza
            </button>
          )}
          {isTrash ? (
            <ConfirmButton
              className="nq-btn nq-btn--danger"
              label="Svuota cestino"
              confirmLabel="Eliminare tutto?"
              onConfirm={props.onEmptyTrash}
            />
          ) : (
            <div className="nq-menu-anchor nq-split-btn">
              <button type="button" className="nq-btn nq-btn--primary" onClick={() => props.onNew()}>
                <MdAdd /> Nuova nota
              </button>
              <button
                type="button"
                className="nq-btn nq-btn--primary nq-split-caret"
                onClick={() => setTemplateMenu((v) => !v)}
                aria-label="Crea da un modello"
                title="Crea da un modello"
              >
                <MdExpandMore />
              </button>
              {templateMenu && (
                <>
                  <div className="nq-menu-backdrop" onClick={() => setTemplateMenu(false)} />
                  <div className="nq-menu nq-menu--right">
                    <p className="nq-menu-title">Crea da un modello</p>
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setTemplateMenu(false);
                          props.onNew(t.id);
                        }}
                      >
                        <strong>{t.label}</strong>
                        <span>{t.description}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="nq-infobar">
        <span>{notes.length} documenti</span>
        {latest > 0 && <span className="nq-infobar-sep">Aggiornata {relativeDay(latest)}</span>}
        {props.tags.length > 0 && (
          <span className="nq-infobar-tags"># {props.tags.slice(0, 4).join(" · ")}</span>
        )}
      </div>

      <div className="nq-toolrow">
        <div className="nq-tabs">
          <button type="button" className={tab === "all" ? "is-on" : ""} onClick={() => setTab("all")}>
            {isTrash ? "Eliminate" : "Tutte le note"}
          </button>
          {!isTrash && (
            <button type="button" className={tab === "starred" ? "is-on" : ""} onClick={() => setTab("starred")}>
              Preferiti
            </button>
          )}
        </div>
        <div className="nq-view-controls">
          <select className="nq-select" value={props.sort} onChange={(e) => props.onSort(e.target.value as SortKey)} aria-label="Ordina per">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </select>
          <button type="button" className={`nq-icon-btn${mode === "grid" ? " is-on" : ""}`} onClick={() => props.onMode("grid")} aria-label="Vista a griglia">
            <MdOutlineGridView />
          </button>
          <button type="button" className={`nq-icon-btn${mode === "list" ? " is-on" : ""}`} onClick={() => props.onMode("list")} aria-label="Vista a elenco">
            <MdOutlineViewList />
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="nq-empty">
          {isTrash
            ? "Il cestino è vuoto."
            : tab === "starred"
              ? "Nessuna nota tra i preferiti."
              : "Nessuna nota qui. Premi N o «Nuova nota» per catturare un'idea."}
        </p>
      ) : (
        <div className={mode === "grid" ? "nq-grid" : "nq-list"}>
          {visible.map((note) => {
            const kicker = props.pathOf(note.folderId);
            const actions = isTrash ? (
              <span className="nq-note-actions">
                <button type="button" className="nq-icon-btn" onClick={(e) => { e.stopPropagation(); props.onRestore(note.id); }} aria-label="Ripristina" title="Ripristina">
                  <MdOutlineRestoreFromTrash />
                </button>
                <span onClick={(e) => e.stopPropagation()}>
                  <ConfirmButton className="nq-btn nq-btn--danger nq-btn--small" label="Elimina" confirmLabel="Sicuro?" onConfirm={() => props.onDeleteForever(note.id)} />
                </span>
              </span>
            ) : (
              <span className="nq-note-actions">
                <button
                  type="button"
                  className="nq-icon-btn nq-hover-only"
                  onClick={(e) => { e.stopPropagation(); props.onTrash(note.id); }}
                  aria-label="Sposta nel cestino"
                  title="Sposta nel cestino"
                >
                  <MdDeleteOutline />
                </button>
                <button
                  type="button"
                  className={`nq-icon-btn nq-star${note.starred ? " is-on" : ""}`}
                  onClick={(e) => { e.stopPropagation(); props.onToggleStar(note); }}
                  aria-label={note.starred ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
                >
                  {note.starred ? <MdStar /> : <MdOutlineStarBorder />}
                </button>
              </span>
            );

            if (mode === "list") {
              return (
                <article
                  key={note.id}
                  className={`nq-row${isTrash ? " is-trashed" : ""}`}
                  onClick={() => !isTrash && props.onOpen(note.id)}
                  onPointerDown={(e) => startNoteDrag(e, note)}
                >
                  <div className="nq-row-main">
                    <h3>{note.title || "Senza titolo"}</h3>
                    <span className="nq-row-kicker">{kicker || "Senza cartella"}</span>
                  </div>
                  {note.tags[0] && <span className="nq-chip">{note.tags[0]}</span>}
                  <span className="nq-row-meta">
                    {note.pageCount} {note.pageCount === 1 ? "pagina" : "pagine"} · {formatWhen(note.updatedAt)}
                  </span>
                  {actions}
                </article>
              );
            }

            return (
              <article
                key={note.id}
                className={`nq-card${isTrash ? " is-trashed" : ""}`}
                onClick={() => !isTrash && props.onOpen(note.id)}
                onPointerDown={(e) => startNoteDrag(e, note)}
              >
                <div className="nq-card-preview">
                  <div className="nq-card-kicker">{kicker || "Senza cartella"}</div>
                  <div className="nq-doc nq-doc--card" dangerouslySetInnerHTML={{ __html: previews.get(note.id) ?? "" }} />
                </div>
                <footer className="nq-card-foot">
                  <div className="nq-card-row">
                    <h3>{note.title || "Senza titolo"}</h3>
                    {actions}
                  </div>
                  <div className="nq-card-row nq-card-meta">
                    <span>
                      {note.pageCount} {note.pageCount === 1 ? "pagina" : "pagine"} · {formatWhen(note.updatedAt)}
                    </span>
                    {note.tags[0] && <span className="nq-chip">{note.tags[0]}</span>}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <footer className="nq-col-foot">
        <span>{notes.length} documenti · Il tuo spazio, le tue idee.</span>
        <span>Premi N per catturare una nuova idea</span>
      </footer>
    </div>
  );
}

export default NoteCollection;
