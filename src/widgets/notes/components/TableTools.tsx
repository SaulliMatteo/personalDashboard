import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import {
  MdAdd,
  MdCallMerge,
  MdCallSplit,
  MdDeleteOutline,
  MdDragIndicator,
  MdFormatAlignCenter,
  MdFormatAlignLeft,
  MdFormatAlignRight,
  MdMoreHoriz,
  MdOutlineTableChart,
} from "react-icons/md";
import {
  alignColumn,
  cellBoxes,
  colCount,
  columnAlign,
  deleteCol,
  deleteRow,
  dragBoundary,
  insertCol,
  insertRow,
  isMerged,
  mergeCells,
  rowCount,
  setHead,
  setWidths,
  sortRows,
  splitCell,
  type CellAlign,
  type CellBox,
  type Rect,
  type TableModel,
} from "../lib/tables";
import { applyWidths, caretCell, cellOf, pageTables, placeCaret, readTable, rectBetween, replaceTable, type CellEl } from "../lib/tableDom";
import "./TableTools.css";

interface TableToolsProps {
  /** La pagina (.nq-paper): i comandi sono posizionati dentro di lei. */
  paper: HTMLElement;
  editorRef: RefObject<HTMLDivElement | null>;
  /** La tabella è cambiata (struttura, larghezze): si salva come una modifica sola. */
  onChange: () => void;
  onNotice: (message: string) => void;
}

type MenuKind = "row" | "col" | "table";

interface MenuState {
  kind: MenuKind;
  table: HTMLTableElement;
  cell: CellEl;
  /** Celle selezionate (per "Unisci celle"), se la selezione ne prende più d'una. */
  merge: Rect | null;
}

/** Segue un trascinamento con il puntatore catturato dall'elemento premuto. */
function track(e: ReactPointerEvent<HTMLElement>, onMove: (ev: PointerEvent) => void, onEnd: () => void) {
  e.preventDefault();
  e.stopPropagation();
  const el = e.currentTarget;
  const id = e.pointerId;
  try {
    el.setPointerCapture(id);
  } catch {
    /* puntatore già rilasciato */
  }
  const move = (ev: PointerEvent) => {
    if (ev.pointerId === id) onMove(ev);
  };
  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", finish);
    el.removeEventListener("pointercancel", finish);
    if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    onEnd();
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);
}

/** I pulsanti non tolgono il cursore dalla pagina (serve per unire le celle selezionate). */
const keepCaret = (e: { preventDefault: () => void }) => e.preventDefault();

/** Bordi delle colonne in px (rispetto alla pagina): C + 1 valori, interpolati dove nessuna cella li tocca. */
function columnEdges(model: TableModel, idOf: Map<CellEl, number>, tableLeft: number, tableRight: number, ox: number): number[] {
  const C = colCount(model);
  const edges = Array.from({ length: C + 1 }, () => Number.NaN);
  const boxes = new Map(cellBoxes(model).map((b) => [b.id, b]));
  for (const [el, id] of idOf) {
    const box = boxes.get(id);
    if (!box) continue;
    const r = el.getBoundingClientRect();
    if (Number.isNaN(edges[box.col])) edges[box.col] = r.left - ox;
    edges[box.col + box.colspan] = r.right - ox;
  }
  if (Number.isNaN(edges[0])) edges[0] = tableLeft;
  if (Number.isNaN(edges[C])) edges[C] = tableRight;
  for (let i = 1; i < C; i++) {
    if (!Number.isNaN(edges[i])) continue;
    let j = i + 1;
    while (Number.isNaN(edges[j])) j++;
    edges[i] = edges[i - 1] + (edges[j] - edges[i - 1]) / (j - i + 1);
  }
  return edges;
}

const ALIGN_ITEMS: { value: CellAlign; label: string; icon: ReactNode }[] = [
  { value: "left", label: "Allinea a sinistra", icon: <MdFormatAlignLeft /> },
  { value: "center", label: "Allinea al centro", icon: <MdFormatAlignCenter /> },
  { value: "right", label: "Allinea a destra", icon: <MdFormatAlignRight /> },
];

/**
 * Comandi delle tabelle della pagina, sopra il testo: + colonna a destra, + riga sotto, maniglie
 * di riga e di colonna con il loro menu, larghezza delle colonne trascinando i confini.
 * Compaiono sulla tabella sotto il mouse, altrimenti su quella dove sta il cursore.
 */
function TableTools({ paper, editorRef, onChange, onNotice }: TableToolsProps) {
  const [hover, setHover] = useState<{ table: HTMLTableElement; cell: CellEl | null } | null>(null);
  const [caret, setCaret] = useState<CellEl | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [, setTick] = useState(0);
  const redraw = () => setTick((t) => t + 1);

  // Il cursore: in quale cella sta.
  useEffect(() => {
    const onSelection = () => setCaret(caretCell(editorRef.current));
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [editorRef]);

  // Il mouse: quale tabella (anche un po' fuori, dove stanno i comandi) e quale cella.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const root = editorRef.current;
      if (!root || (e.target instanceof Element && e.target.closest(".nq-tbl-tools"))) return;
      const table = pageTables(root).find((t) => {
        const r = t.getBoundingClientRect();
        return e.clientX >= r.left - 34 && e.clientX <= r.right + 30 && e.clientY >= r.top - 28 && e.clientY <= r.bottom + 26;
      });
      if (!table) {
        setHover((h) => (h ? null : h));
        return;
      }
      const over = cellOf(root, e.target instanceof Node ? e.target : null);
      const cell = over && over.closest("table") === table ? over : null;
      setHover((h) => {
        if (h && h.table === table && (cell === null || h.cell === cell)) return h;
        return { table, cell: cell ?? (h?.table === table ? h.cell : null) };
      });
    };
    const onLeave = () => setHover(null);
    paper.addEventListener("pointermove", onMove);
    paper.addEventListener("pointerleave", onLeave);
    return () => {
      paper.removeEventListener("pointermove", onMove);
      paper.removeEventListener("pointerleave", onLeave);
    };
  }, [paper, editorRef]);

  const root = paper.querySelector<HTMLElement>(":scope > .nq-doc--editor");
  const alive = (t: HTMLTableElement | null | undefined): t is HTMLTableElement => !!t && !!root && t.isConnected && t.parentElement === root;
  const caretTable = caret?.closest("table") ?? null;
  const menuTable = menu && alive(menu.table) ? menu.table : null;
  const table = menuTable ?? (alive(hover?.table) ? hover.table : alive(caretTable) ? caretTable : null);

  // La riga del cursore ha data-cur (la colora il tema). Non viene salvata (serializeEditor).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const row = caret?.closest("tr") ?? null;
    el.querySelectorAll("tr[data-cur]").forEach((tr) => {
      if (tr !== row) tr.removeAttribute("data-cur");
    });
    if (row && !row.hasAttribute("data-cur")) row.setAttribute("data-cur", "");
  });

  // Si ridisegnano i comandi quando la tabella cambia misura (si scrive, si allarga la pagina…).
  useEffect(() => {
    if (!table) return;
    const observer = new ResizeObserver(() => setTick((t) => t + 1));
    observer.observe(table);
    return () => observer.disconnect();
  }, [table]);

  if (!table || !root) return null;

  // ---------- Misure (px, rispetto al bordo interno della pagina) ----------
  const { model, idOf } = readTable(table);
  const pr = paper.getBoundingClientRect();
  const ox = pr.left + paper.clientLeft;
  const oy = pr.top + paper.clientTop;
  const tr = table.getBoundingClientRect();
  const box = { left: tr.left - ox, top: tr.top - oy, width: tr.width, height: tr.height };
  const rows = Array.from(table.rows).map((row) => {
    const r = row.getBoundingClientRect();
    return { top: r.top - oy, height: r.height };
  });
  const edges = columnEdges(model, idOf, box.left, box.left + box.width, ox);
  const boxes = new Map(cellBoxes(model).map((b) => [b.id, b]));
  const boxFor = (cell: CellEl | null | undefined): CellBox | null => {
    const id = cell ? idOf.get(cell) : undefined;
    return id === undefined ? null : (boxes.get(id) ?? null);
  };
  const activeCell = menuTable ? menu?.cell : hover?.table === table && hover.cell ? hover.cell : caretTable === table ? caret : null;
  const active = boxFor(activeCell) ?? boxes.get(model.grid[0]?.[0]) ?? null;

  // ---------- Comandi ----------

  /** Rimette la tabella (nuova struttura) e il cursore nella cella [riga, colonna]. */
  function commit(next: TableModel | null, at: [number, number] | null) {
    setMenu(null);
    if (!table) return;
    if (next === null) {
      removeTable();
      return;
    }
    const written = replaceTable(table, next);
    if (at) {
      const r = Math.min(Math.max(0, at[0]), rowCount(next) - 1);
      const c = Math.min(Math.max(0, at[1]), colCount(next) - 1);
      const el = written.cellOf.get(next.grid[r][c]);
      if (el) placeCaret(el);
    }
    onChange();
  }

  function removeTable() {
    const el = editorRef.current;
    if (!table || !el) return;
    const after = (table.nextElementSibling ?? table.previousElementSibling) as HTMLElement | null;
    table.remove();
    if (!el.firstElementChild) el.innerHTML = "<p><br></p>";
    const target = after && after.isConnected ? after : (el.firstElementChild as HTMLElement | null);
    if (target && !target.hasAttribute("data-block")) {
      const range = document.createRange();
      range.setStart(target, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      el.focus({ preventScroll: true });
    }
    setMenu(null);
    onChange();
    onNotice("Tabella eliminata");
  }

  function openMenu(kind: MenuKind) {
    if (!table) return;
    if (menu && menu.kind === kind && menu.table === table) {
      setMenu(null);
      return;
    }
    const cell = activeCell ?? table.rows[0]?.cells[0];
    if (!cell) return;
    // Selezione su più celle: si possono unire.
    let merge: Rect | null = null;
    const sel = window.getSelection();
    const el = editorRef.current;
    if (el && sel && !sel.isCollapsed) {
      const a = cellOf(el, sel.anchorNode);
      const b = cellOf(el, sel.focusNode);
      const ia = a ? idOf.get(a) : undefined;
      const ib = b ? idOf.get(b) : undefined;
      if (ia !== undefined && ib !== undefined && ia !== ib) merge = rectBetween(model, ia, ib);
    }
    setMenu({ kind, table, cell, merge });
  }

  function addColumn() {
    const at = colCount(model);
    commit(insertCol(model, at), [active?.row ?? 0, at]);
  }

  function addRow() {
    const at = rowCount(model);
    commit(insertRow(model, at), [at, 0]);
  }

  function sort(dir: 1 | -1) {
    if (!active) return;
    const next = sortRows(model, active.col, dir);
    if (!next) {
      setMenu(null);
      const body = rowCount(model) - (model.head ? 1 : 0);
      onNotice(body < 2 ? "Servono almeno due righe da ordinare" : "Non si può ordinare: ci sono celle unite su più righe");
      return;
    }
    commit(next, [model.head ? 1 : 0, active.col]);
  }

  function merge() {
    if (!menu?.merge) return;
    const result = mergeCells(model, menu.merge);
    if (!result.ok) {
      setMenu(null);
      onNotice(result.reason === "intestazione" ? "L'intestazione non si unisce con le altre righe" : "Seleziona almeno due celle");
      return;
    }
    const b = cellBoxes(result.model).find((x) => x.id === result.id);
    commit(result.model, b ? [b.row, b.col] : null);
  }

  /** Larghezza delle colonne: si trascina il confine tra la colonna `c` e la successiva. */
  function startWidth(e: ReactPointerEvent<HTMLElement>, c: number) {
    if (!table) return;
    const t = table;
    const px = edges.slice(1).map((x, i) => x - edges[i]);
    const sx = e.clientX;
    let moved = false;
    track(
      e,
      (ev) => {
        moved = true;
        applyWidths(t, dragBoundary(px, c, ev.clientX - sx, 24));
        redraw();
      },
      () => {
        if (moved) onChange();
      }
    );
  }

  function widthKey(e: ReactKeyboardEvent<HTMLElement>, c: number) {
    if (!table || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const px = edges.slice(1).map((x, i) => x - edges[i]);
    applyWidths(table, dragBoundary(px, c, e.key === "ArrowLeft" ? -12 : 12, 24));
    redraw();
    onChange();
  }

  const C = colCount(model);
  const colAlign = active ? columnAlign(model, active.col) : null;
  const hasWidths = model.widths.some((w) => w !== null);
  const rowTop = active ? rows[active.row] : null;
  const rowMid = rowTop ? rowTop.top + rowTop.height / 2 : box.top;
  const colMid = active ? (edges[active.col] + edges[active.col + active.colspan]) / 2 : box.left;
  const open = menuTable ? menu : null;

  return (
    <div className="nq-tbl-tools">
      {open && <div className="nq-tbl-backdrop" onMouseDown={keepCaret} onClick={() => setMenu(null)} />}

      {/* Confini delle colonne: trascinandoli si cambia la larghezza */}
      {edges.slice(1, C).map((x, i) => (
        <span
          key={`w${i}`}
          className="nq-tbl-colh"
          style={{ left: x - 4, top: box.top, height: box.height }}
          role="separator"
          aria-orientation="vertical"
          aria-label={`Larghezza della colonna ${i + 1} (frecce per cambiarla)`}
          tabIndex={0}
          onMouseDown={keepCaret}
          onPointerDown={(e) => startWidth(e, i)}
          onKeyDown={(e) => widthKey(e, i)}
        />
      ))}

      <button
        type="button"
        className="nq-tbl-add nq-tbl-add--col"
        style={{ left: box.left + box.width + 6, top: box.top, height: box.height }}
        aria-label="Aggiungi colonna"
        title="Aggiungi colonna"
        onMouseDown={keepCaret}
        onClick={addColumn}
      >
        <MdAdd />
      </button>
      <button
        type="button"
        className="nq-tbl-add nq-tbl-add--row"
        style={{ left: box.left, top: box.top + box.height + 4, width: box.width }}
        aria-label="Aggiungi riga"
        title="Aggiungi riga (Tab nell'ultima cella)"
        onMouseDown={keepCaret}
        onClick={addRow}
      >
        <MdAdd />
      </button>

      {/* Menu della tabella, in alto a sinistra */}
      <span className="nq-tbl-anchor" style={{ left: box.left - 26, top: box.top - 24 }}>
        <button
          type="button"
          className="nq-tbl-grip"
          aria-label="Menu della tabella"
          title="Menu della tabella"
          aria-haspopup="menu"
          aria-expanded={open?.kind === "table"}
          onMouseDown={keepCaret}
          onClick={() => openMenu("table")}
        >
          <MdOutlineTableChart />
        </button>
        {open?.kind === "table" && (
          <div className="nq-menu nq-tbl-menu" role="menu" onMouseDown={keepCaret}>
            <button type="button" role="menuitemcheckbox" aria-checked={model.head} onClick={() => commit(setHead(model, !model.head), active ? [active.row, active.col] : null)}>
              <strong>{model.head ? "Togli l'intestazione" : "Prima riga come intestazione"}</strong>
            </button>
            <button type="button" role="menuitem" disabled={!menu?.merge} onClick={merge}>
              <strong>
                <MdCallMerge aria-hidden="true" /> Unisci celle
              </strong>
              <span>{menu?.merge ? "Le celle selezionate diventano una" : "Seleziona prima più celle trascinando"}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!active || !isMerged(model, active.id)}
              onClick={() => active && commit(splitCell(model, active.id), [active.row, active.col])}
            >
              <strong>
                <MdCallSplit aria-hidden="true" /> Dividi cella
              </strong>
            </button>
            <button type="button" role="menuitem" disabled={!hasWidths} onClick={() => commit(setWidths(model, null), active ? [active.row, active.col] : null)}>
              <strong>Colonne di uguale larghezza</strong>
            </button>
            <button type="button" role="menuitem" className="nq-menu-danger" onClick={removeTable}>
              <strong>
                <MdDeleteOutline aria-hidden="true" /> Elimina tabella
              </strong>
            </button>
          </div>
        )}
      </span>

      {active && rowTop && (
        <span className="nq-tbl-anchor" style={{ left: box.left - 26, top: rowMid - 11 }}>
          <button
            type="button"
            className="nq-tbl-grip"
            aria-label={`Menu della riga ${active.row + 1}`}
            title="Menu della riga"
            aria-haspopup="menu"
            aria-expanded={open?.kind === "row"}
            onMouseDown={keepCaret}
            onClick={() => openMenu("row")}
          >
            <MdDragIndicator />
          </button>
          {open?.kind === "row" && (
            <div className="nq-menu nq-tbl-menu" role="menu" onMouseDown={keepCaret}>
              <button type="button" role="menuitem" onClick={() => commit(insertRow(model, active.row), [active.row, active.col])}>
                <strong>Inserisci riga sopra</strong>
              </button>
              <button type="button" role="menuitem" onClick={() => commit(insertRow(model, active.row + active.rowspan), [active.row + active.rowspan, active.col])}>
                <strong>Inserisci riga sotto</strong>
              </button>
              <button type="button" role="menuitem" className="nq-menu-danger" onClick={() => commit(deleteRow(model, active.row), [active.row, active.col])}>
                <strong>
                  <MdDeleteOutline aria-hidden="true" /> Elimina riga
                </strong>
              </button>
            </div>
          )}
        </span>
      )}

      {active && (
        <span className="nq-tbl-anchor" style={{ left: colMid - 11, top: box.top - 24 }}>
          <button
            type="button"
            className="nq-tbl-grip nq-tbl-grip--col"
            aria-label={`Menu della colonna ${active.col + 1}`}
            title="Menu della colonna"
            aria-haspopup="menu"
            aria-expanded={open?.kind === "col"}
            onMouseDown={keepCaret}
            onClick={() => openMenu("col")}
          >
            <MdMoreHoriz />
          </button>
          {open?.kind === "col" && (
            <div className="nq-menu nq-tbl-menu" role="menu" onMouseDown={keepCaret}>
              <button type="button" role="menuitem" onClick={() => commit(insertCol(model, active.col), [active.row, active.col])}>
                <strong>Inserisci colonna a sinistra</strong>
              </button>
              <button type="button" role="menuitem" onClick={() => commit(insertCol(model, active.col + active.colspan), [active.row, active.col + active.colspan])}>
                <strong>Inserisci colonna a destra</strong>
              </button>
              <div className="nq-tbl-aligns" role="group" aria-label="Allineamento della colonna">
                {ALIGN_ITEMS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    aria-label={a.label}
                    title={a.label}
                    aria-pressed={(colAlign ?? "left") === a.value}
                    onClick={() => commit(alignColumn(model, active.col, a.value), [active.row, active.col])}
                  >
                    {a.icon}
                  </button>
                ))}
              </div>
              <button type="button" role="menuitem" onClick={() => sort(1)}>
                <strong>Ordina A → Z</strong>
              </button>
              <button type="button" role="menuitem" onClick={() => sort(-1)}>
                <strong>Ordina Z → A</strong>
              </button>
              <button type="button" role="menuitem" className="nq-menu-danger" onClick={() => commit(deleteCol(model, active.col), [active.row, active.col])}>
                <strong>
                  <MdDeleteOutline aria-hidden="true" /> Elimina colonna
                </strong>
              </button>
            </div>
          )}
        </span>
      )}
    </div>
  );
}

export default TableTools;
