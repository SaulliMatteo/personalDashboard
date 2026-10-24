import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MdClose, MdLink, MdOpenInNew, MdOutlineGridView, MdOutlineTableChart, MdOutlineViewKanban } from "react-icons/md";
import { OP_LABELS, groupableFields, viewRows, type CellValue, type Field, type FieldType, type Row, type ValueContext, type ViewLayout } from "../lib/collections";
import {
  addField,
  addRow,
  fetchCollectionUses,
  fieldsOf,
  restoreCollection,
  rowsOf,
  setCell,
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
import "./CollectionView.css";

export interface CollectionLinks {
  notes: NoteRef[];
  onOpenNote: (id: number) => void;
  onOpenCollection: (id: number) => void;
}

interface CollectionViewProps extends CollectionLinks {
  viewId: number;
  onNotice: (message: string) => void;
  /** Toglie il blocco dalla nota (la raccolta resta). */
  onRemove: () => void;
}

const LAYOUTS: { key: ViewLayout; label: string; icon: ReactNode }[] = [
  { key: "tabella", label: "Tabella", icon: <MdOutlineTableChart /> },
  { key: "schede", label: "Schede", icon: <MdOutlineGridView /> },
  { key: "bacheca", label: "Bacheca", icon: <MdOutlineViewKanban /> },
];

/**
 * Vista collegata di una raccolta, dentro una nota (blocco data-block="collection-view").
 * I dati stanno nella raccolta: si modificano qui e cambiano ovunque (lib/collectionsStore.ts).
 * Filtro, ordinamento e layout sono della vista, cioè di questa nota.
 */
function CollectionView({ viewId, notes, onOpenNote, onOpenCollection, onNotice, onRemove }: CollectionViewProps) {
  const store = useCollections();
  const [now] = useState(() => new Date());
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [uses, setUses] = useState<number | null>(null);

  const titles = useMemo(() => new Map(notes.map((n) => [n.id, n.title || "Senza titolo"])), [notes]);
  const ctx: ValueContext = useMemo(() => ({ now, noteTitle: (id) => titles.get(id) ?? null }), [now, titles]);

  const view = store.views.find((v) => v.id === viewId) ?? null;
  const collection = view ? store.collections.find((c) => c.id === view.collectionId) ?? null : null;
  const collectionId = collection?.id ?? null;

  // "usata in N note": dal database, all'apertura della vista.
  useEffect(() => {
    if (collectionId === null) return;
    let alive = true;
    fetchCollectionUses(collectionId)
      .then((list) => alive && setUses(list.length))
      .catch(() => alive && setUses(null));
    return () => {
      alive = false;
    };
  }, [collectionId, store.loaded]);

  async function run(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
    } catch (error) {
      console.error(failure, error);
      onNotice(failure);
    }
  }

  // Dentro la vista i tasti e il trascinamento restano suoi (non vanno al testo della nota).
  const shell = (children: ReactNode, className = "") => (
    <div className={`nq-dbv${className}`} onMouseDown={(e) => e.stopPropagation()} onDragStart={(e) => e.preventDefault()}>
      {children}
    </div>
  );

  if (!store.loaded) return shell(<p className="nq-dbv-msg">Caricamento della raccolta…</p>);
  if (!view || !collection) {
    return shell(
      <div className="nq-dbv-gone">
        <span>Raccolta eliminata per sempre: questa vista non ha più dati.</span>
        <button type="button" className="nq-btn nq-btn--small" onClick={onRemove}>
          Togli dalla nota
        </button>
      </div>,
      " is-gone"
    );
  }
  if (collection.deletedAt !== null) {
    return shell(
      <div className="nq-dbv-gone">
        <span>
          <b>Raccolta eliminata</b> · «{collection.name}»
        </span>
        <button type="button" className="nq-btn nq-btn--small" onClick={() => void run(() => restoreCollection(collection.id), "Impossibile ripristinare la raccolta")}>
          Ripristina
        </button>
      </div>,
      " is-gone"
    );
  }

  const fields = fieldsOf(store, collection.id).filter((f) => !view.hidden.includes(f.id));
  const allRows = rowsOf(store, collection.id);
  const rows = viewRows(allRows, fields, view, ctx);
  const groupable = groupableFields(fields);
  const groupField = groupable.find((f) => f.id === view.groupField) ?? groupable[0] ?? null;
  const shownRow = openRow !== null ? allRows.find((r) => r.id === openRow && r.deletedAt === null) ?? null : null;
  const byId = new Map(fields.map((f) => [f.id, f]));
  const filterText = view.filter
    .map((f) => {
      const field = byId.get(f.field);
      return field ? `${field.name} ${OP_LABELS[f.op]}` : null;
    })
    .filter(Boolean)
    .join(", ");

  const cell = (row: Row, field: Field, value: CellValue) => void run(() => setCell(row.id, field.id, value), "Impossibile salvare la cella");
  const newRow = (data: Record<string, CellValue> = {}) =>
    void run(async () => {
      const row = await addRow(collection.id, data);
      if (view.layout !== "tabella") setOpenRow(row.id);
    }, "Impossibile aggiungere la riga");
  const deleteRow = (row: Row) => {
    setOpenRow(null);
    void run(async () => {
      await trashRow(row.id);
      onNotice("Riga eliminata: si ripristina dalla pagina della raccolta");
    }, "Impossibile eliminare la riga");
  };
  const newField = (type: FieldType) => void run(() => addField(collection.id, type), "Impossibile aggiungere il campo");

  return shell(
    <>
      <div className="nq-dbv-head">
        <b>{collection.name}</b>
        <span className="nq-dbv-linked">
          <span className="nq-dbv-led" aria-hidden="true" />
          <MdLink className="nq-dbv-link-ico" aria-hidden="true" />
          Vista collegata
        </span>
        <span className="nq-dbv-meta">
          {[filterText, uses !== null ? `usata in ${uses} ${uses === 1 ? "nota" : "note"}` : ""].filter(Boolean).join(", ")}
        </span>
        <span className="nq-dbv-sp" />
        <span className="nq-dbv-meta">Modifichi qui, cambia ovunque</span>
        <span className="nq-dbv-tabs" role="tablist" aria-label="Vista">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              type="button"
              role="tab"
              aria-selected={view.layout === l.key}
              aria-label={l.label}
              title={l.label}
              onClick={() => void run(() => updateView(view.id, { layout: l.key }), "Impossibile cambiare vista")}
            >
              {l.icon}
            </button>
          ))}
        </span>
        <button type="button" className="nq-dbv-btn" aria-label="Apri la raccolta" title="Apri la raccolta" onClick={() => onOpenCollection(collection.id)}>
          <MdOpenInNew />
        </button>
        <button type="button" className="nq-dbv-btn" aria-label="Togli la vista dalla nota" title="Togli dalla nota (la raccolta resta)" onClick={onRemove}>
          <MdClose />
        </button>
      </div>

      <div className="nq-dbv-body">
        <ViewBar
          view={{ ...view, groupField: groupField?.id ?? null }}
          fields={fields}
          ctx={ctx}
          onChange={(patch) => void run(() => updateView(view.id, patch), "Impossibile salvare la vista")}
        />
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
      </div>

      {shownRow && (
        <RowCard
          collectionName={collection.name}
          fields={fieldsOf(store, collection.id)}
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
    </>
  );
}

export default CollectionView;
