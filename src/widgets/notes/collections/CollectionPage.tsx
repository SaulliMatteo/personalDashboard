import { useMemo, useState, type ReactNode } from "react";
import { MdDeleteOutline, MdMoreHoriz, MdOutlineGridView, MdOutlineTableChart, MdOutlineViewKanban } from "react-icons/md";
import { groupableFields, viewRows, type CellValue, type Field, type FieldType, type Row, type ValueContext, type ViewLayout } from "../lib/collections";
import {
  addField,
  addRow,
  fieldsOf,
  pageViewOf,
  renameCollection,
  restoreCollection,
  restoreRow,
  rowsOf,
  setCell,
  trashCollection,
  trashRow,
  updateView,
  useCollections,
} from "../lib/collectionsStore";
import type { NoteRef } from "./CellEditor";
import CollectionBoard from "./CollectionBoard";
import CollectionCards from "./CollectionCards";
import CollectionTable from "./CollectionTable";
import RowCard from "./RowCard";
import ViewBar from "./ViewBar";
import "./CollectionPage.css";

interface CollectionPageProps {
  collectionId: number;
  notes: NoteRef[];
  onOpenNote: (id: number) => void;
  onNotice: (message: string) => void;
  /** Dopo "Elimina raccolta": si torna alle note. */
  onTrashed: () => void;
}

const LAYOUTS: { key: ViewLayout; label: string; icon: ReactNode }[] = [
  { key: "tabella", label: "Tabella", icon: <MdOutlineTableChart /> },
  { key: "schede", label: "Schede", icon: <MdOutlineGridView /> },
  { key: "bacheca", label: "Bacheca", icon: <MdOutlineViewKanban /> },
];

/** Pagina di una raccolta: tabella / schede / bacheca, campi, filtri; a destra "Usata in". */
function CollectionPage({ collectionId, notes, onOpenNote, onNotice, onTrashed }: CollectionPageProps) {
  const store = useCollections();
  const [now] = useState(() => new Date());
  const [title, setTitle] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [lastDeleted, setLastDeleted] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [armed, setArmed] = useState(false);

  const titles = useMemo(() => new Map(notes.map((n) => [n.id, n.title || "Senza titolo"])), [notes]);
  const ctx: ValueContext = useMemo(() => ({ now, noteTitle: (id) => titles.get(id) ?? null }), [now, titles]);

  const collection = store.collections.find((c) => c.id === collectionId) ?? null;
  const fields = fieldsOf(store, collectionId);
  const allRows = rowsOf(store, collectionId);
  const view = pageViewOf(store, collectionId);

  if (!store.loaded) return <p className="nq-coll-msg">Caricamento…</p>;
  if (store.error) return <p className="nq-coll-msg">{store.error}</p>;
  if (!collection || !view) return <p className="nq-coll-msg">Questa raccolta non esiste più.</p>;

  if (collection.deletedAt !== null) {
    return (
      <div className="nq-coll nq-coll--deleted">
        <p>
          <strong>Raccolta eliminata</strong> · «{collection.name}» è nel cestino.
        </p>
        <button type="button" className="nq-btn" onClick={() => void run(() => restoreCollection(collectionId), "Impossibile ripristinare la raccolta")}>
          Ripristina
        </button>
      </div>
    );
  }

  const rows = viewRows(allRows, fields, view, ctx);
  const groupable = groupableFields(fields);
  const groupField = groupable.find((f) => f.id === view.groupField) ?? groupable[0] ?? null;
  const shownRow = openRow !== null ? allRows.find((r) => r.id === openRow && r.deletedAt === null) ?? null : null;

  async function run(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
    } catch (error) {
      console.error(failure, error);
      onNotice(failure);
    }
  }

  function cell(row: Row, field: Field, value: CellValue) {
    void run(() => setCell(row.id, field.id, value), "Impossibile salvare la cella");
  }

  function newRow(data: Record<string, CellValue> = {}) {
    void run(async () => {
      const row = await addRow(collectionId, data);
      // Nelle schede la riga nuova si apre subito; nella tabella si scrive sul posto.
      if (view?.layout !== "tabella") setOpenRow(row.id);
    }, "Impossibile aggiungere la riga");
  }

  function deleteRow(row: Row) {
    setOpenRow(null);
    setLastDeleted(row.id);
    void run(() => trashRow(row.id), "Impossibile eliminare la riga");
  }

  function newField(type: FieldType) {
    void run(() => addField(collectionId, type), "Impossibile aggiungere il campo");
  }

  const used: NoteRef[] = []; // Fase 6b: note che mostrano una vista o un riferimento a una riga.

  return (
    <div className="nq-coll">
      <div className="nq-coll-main">
        <div className="nq-coll-h">
          <input
            className="nq-coll-title"
            aria-label="Nome della raccolta"
            value={title ?? collection.name}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title !== null && title.trim() !== collection.name) void run(() => renameCollection(collectionId, title), "Impossibile rinominare la raccolta");
              setTitle(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <span className="nq-coll-sp" />
          <div className="nq-coll-tabs" role="tablist" aria-label="Vista della raccolta">
            {LAYOUTS.map((l) => (
              <button
                key={l.key}
                type="button"
                role="tab"
                aria-selected={view.layout === l.key}
                onClick={() => void run(() => updateView(view.id, { layout: l.key }), "Impossibile cambiare vista")}
              >
                {l.icon}
                {l.label}
              </button>
            ))}
          </div>
          <span className="nq-coll-anchor">
            <button type="button" className="nq-icon-btn" aria-label="Altro" title="Altro" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
              <MdMoreHoriz />
            </button>
            {menuOpen && (
              <>
                <div className="nq-fmenu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="nq-fmenu nq-coll-menu" role="menu">
                  <p className="nq-fmenu-hint">
                    {allRows.filter((r) => r.deletedAt === null).length} righe, {fields.length} campi
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    className={`nq-fmenu-btn nq-fmenu-danger${armed ? " is-armed" : ""}`}
                    onClick={() => {
                      if (!armed) {
                        setArmed(true);
                        return;
                      }
                      setMenuOpen(false);
                      void run(async () => {
                        await trashCollection(collectionId);
                        onNotice(`«${collection.name}» spostata nel cestino`);
                        onTrashed();
                      }, "Impossibile eliminare la raccolta");
                    }}
                  >
                    <MdDeleteOutline aria-hidden="true" /> {armed ? "Clicca ancora per eliminare" : "Elimina raccolta"}
                  </button>
                </div>
              </>
            )}
          </span>
        </div>

        <ViewBar
          view={{ ...view, groupField: groupField?.id ?? null }}
          fields={fields}
          ctx={ctx}
          onChange={(patch) => void run(() => updateView(view.id, patch), "Impossibile salvare la vista")}
        />

        <div className="nq-cview">
          {view.layout === "tabella" && (
            <CollectionTable
              fields={fields}
              rows={rows}
              notes={notes}
              ctx={ctx}
              onCell={cell}
              onAddRow={() => newRow()}
              onAddField={newField}
              onOpenRow={(r) => setOpenRow(r.id)}
              onDeleteRow={deleteRow}
              onOpenNote={onOpenNote}
              onNotice={onNotice}
            />
          )}
          {view.layout === "schede" && <CollectionCards fields={fields} rows={rows} ctx={ctx} onOpenRow={(r) => setOpenRow(r.id)} onAddRow={() => newRow()} />}
          {view.layout === "bacheca" && (
            <CollectionBoard
              fields={fields}
              rows={rows}
              groupField={groupField}
              ctx={ctx}
              onOpenRow={(r) => setOpenRow(r.id)}
              onMoveRow={(r, key) => groupField && cell(r, groupField, key || null)}
              onAddRow={(key) => newRow(groupField && key ? { [String(groupField.id)]: key } : {})}
            />
          )}
          {rows.length === 0 && allRows.some((r) => r.deletedAt === null) && <p className="nq-coll-msg">Nessuna riga con questi filtri.</p>}
        </div>

        {lastDeleted !== null && (
          <p className="nq-coll-undo" role="status">
            Riga eliminata ·{" "}
            <button
              type="button"
              onClick={() => {
                const id = lastDeleted;
                setLastDeleted(null);
                void run(() => restoreRow(id), "Impossibile ripristinare la riga");
              }}
            >
              Ripristina
            </button>
          </p>
        )}
      </div>

      <aside className="nq-usedin" aria-label="Usata in">
        <h4>Usata in</h4>
        {used.length === 0 && <p className="nq-usedin-hint">Non è ancora mostrata in nessuna nota.</p>}
        <p className="nq-usedin-hint">Eliminando la raccolta, le viste nelle note mostrano «Raccolta eliminata» con il pulsante Ripristina.</p>
      </aside>

      {shownRow && (
        <RowCard
          collectionName={collection.name}
          fields={fields}
          row={shownRow}
          notes={notes}
          ctx={ctx}
          onCell={(f, v) => cell(shownRow, f, v)}
          onDelete={() => deleteRow(shownRow)}
          onClose={() => setOpenRow(null)}
          onOpenNote={(id) => {
            setOpenRow(null);
            onOpenNote(id);
          }}
          onNotice={onNotice}
        />
      )}
    </div>
  );
}

export default CollectionPage;
