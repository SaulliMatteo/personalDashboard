import {
  EMPTY_CELL,
  boxOf,
  cellOrder,
  createTable,
  fromRows,
  insertRow,
  layoutRows,
  rowCount,
  type CellAlign,
  type RawCell,
  type TableModel,
} from "./tables";

/**
 * Tabelle nel DOM della pagina: lettura e scrittura del modello (lib/tables.ts), cursore nelle
 * celle, larghezze delle colonne. Nell'HTML salvato:
 *   <table><thead><tr><th data-width="30" data-align="right">…</th>…</tr></thead><tbody>…</tbody></table>
 * Le larghezze si vedono grazie a un <colgroup data-runtime> che si rifà da data-width a ogni
 * disegno (layoutTables) e non viene mai salvato; la riga del cursore ha data-cur (non salvato).
 */

export type CellEl = HTMLTableCellElement;

const ALIGNS: readonly string[] = ["left", "center", "right"];

export function asCellAlign(value: string | null | undefined): CellAlign | null {
  return value && ALIGNS.includes(value) ? (value as CellAlign) : null;
}

export function asCellWidth(value: string | null | undefined): number | null {
  const n = Number(value);
  return value && Number.isFinite(n) && n >= 1 && n <= 100 ? Math.round(n * 10) / 10 : null;
}

/** Le tabelle della pagina (solo quelle di primo livello). */
export function pageTables(root: ParentNode): HTMLTableElement[] {
  return Array.from(root.children).filter((el): el is HTMLTableElement => el instanceof HTMLTableElement);
}

/** La cella che contiene il nodo, se la sua tabella è un blocco della pagina. */
export function cellOf(root: HTMLElement, node: Node | null): CellEl | null {
  if (!node || !root.contains(node)) return null;
  const el = node instanceof Element ? node : node.parentElement;
  const cell = el?.closest<CellEl>("td, th") ?? null;
  return cell && cell.closest("table")?.parentElement === root ? cell : null;
}

/** La cella del cursore. */
export function caretCell(root: HTMLElement | null): CellEl | null {
  if (!root) return null;
  return cellOf(root, window.getSelection()?.anchorNode ?? null);
}

export interface ReadTable {
  model: TableModel;
  /** Id del modello di ogni cella del DOM. */
  idOf: Map<CellEl, number>;
}

export function readTable(table: HTMLTableElement): ReadTable {
  const rows = Array.from(table.rows);
  const head = !!table.tHead && rows[0]?.parentElement === table.tHead;
  const raw: RawCell[][] = rows.map((tr, r) =>
    Array.from(tr.cells).map((cell) => {
      const clone = cell.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("[data-runtime]").forEach((n) => n.remove());
      return {
        html: clone.innerHTML.trim() ? clone.innerHTML : EMPTY_CELL,
        colspan: cell.colSpan || 1,
        // rowspan="0" = fino in fondo
        rowspan: cell.rowSpan === 0 ? rows.length - r : cell.rowSpan || 1,
        align: asCellAlign(cell.getAttribute("data-align")),
        width: r === 0 ? asCellWidth(cell.getAttribute("data-width")) : null,
      };
    })
  );
  const { model, ids } = fromRows(raw, head);
  const idOf = new Map<CellEl, number>();
  rows.forEach((tr, r) => Array.from(tr.cells).forEach((cell, i) => idOf.set(cell, ids[r][i])));
  return { model, idOf };
}

export interface WrittenTable {
  table: HTMLTableElement;
  cellOf: Map<number, CellEl>;
}

export function writeTable(model: TableModel): WrittenTable {
  const table = document.createElement("table");
  const cellMap = new Map<number, CellEl>();
  const layout = layoutRows(model);
  let body: HTMLTableSectionElement | null = null;
  layout.forEach((boxes, r) => {
    const isHead = model.head && r === 0;
    let section: HTMLTableSectionElement;
    if (isHead) {
      section = document.createElement("thead");
      table.appendChild(section);
    } else {
      if (!body) {
        body = document.createElement("tbody");
        table.appendChild(body);
      }
      section = body;
    }
    const tr = document.createElement("tr");
    for (const box of boxes) {
      const cell = document.createElement(isHead ? "th" : "td");
      const data = model.cells[box.id];
      cell.innerHTML = data.html || EMPTY_CELL;
      if (box.colspan > 1) cell.colSpan = box.colspan;
      if (box.rowspan > 1) cell.rowSpan = box.rowspan;
      if (data.align) cell.setAttribute("data-align", data.align);
      if (r === 0) {
        const parts = model.widths.slice(box.col, box.col + box.colspan);
        if (parts.every((w) => w !== null)) {
          const sum = parts.reduce<number>((a, b) => a + (b ?? 0), 0);
          cell.setAttribute("data-width", String(Math.round(sum * 10) / 10));
        }
      }
      tr.appendChild(cell);
      cellMap.set(box.id, cell);
    }
    section.appendChild(tr);
  });
  return { table, cellOf: cellMap };
}

/** Una tabella nuova (3×3 con intestazione) pronta da mettere nella pagina. */
export function createTableElement(rows = 3, cols = 3): HTMLTableElement {
  return writeTable(createTable(rows, cols, true)).table;
}

/** Sostituisce la tabella con quella del modello e rifà le larghezze. */
export function replaceTable(old: HTMLTableElement, model: TableModel): WrittenTable {
  const written = writeTable(model);
  old.replaceWith(written.table);
  layoutTable(written.table);
  return written;
}

/** Larghezze per colonna (in %) lette da data-width della prima riga; null = automatiche. */
function columnWidths(table: HTMLTableElement): number[] | null {
  const first = table.rows[0];
  if (!first) return null;
  const widths: number[] = [];
  let any = false;
  for (const cell of Array.from(first.cells)) {
    const w = asCellWidth(cell.getAttribute("data-width"));
    const span = Math.max(1, cell.colSpan || 1);
    if (w !== null) any = true;
    for (let i = 0; i < span; i++) widths.push(w === null ? Number.NaN : w / span);
  }
  if (!any) return null;
  const known = widths.filter((w) => !Number.isNaN(w));
  const rest = Math.max(5, (100 - known.reduce((a, b) => a + b, 0)) / Math.max(1, widths.length - known.length));
  return widths.map((w) => (Number.isNaN(w) ? rest : w));
}

/** Rifà il <colgroup> di una tabella dalle sue data-width (o lo toglie). */
export function layoutTable(table: HTMLTableElement): void {
  const widths = columnWidths(table);
  let group = table.querySelector<HTMLTableColElement>(":scope > colgroup[data-runtime]");
  if (!widths) {
    group?.remove();
    return;
  }
  if (!group) {
    group = document.createElement("colgroup");
    group.setAttribute("data-runtime", "table");
    table.prepend(group);
  }
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  while (group.children.length > widths.length) group.lastElementChild?.remove();
  while (group.children.length < widths.length) group.appendChild(document.createElement("col"));
  widths.forEach((w, i) => ((group.children[i] as HTMLElement).style.width = `${(w / total) * 100}%`));
}

export function layoutTables(root: ParentNode): void {
  root.querySelectorAll<HTMLTableElement>("table").forEach(layoutTable);
}

/**
 * Larghezze nuove durante il trascinamento: scritte nella prima riga (data-width) e nel colgroup.
 * `widths` è per colonna, in %.
 */
export function applyWidths(table: HTMLTableElement, widths: number[]): void {
  const first = table.rows[0];
  if (!first) return;
  let col = 0;
  for (const cell of Array.from(first.cells)) {
    const span = Math.max(1, cell.colSpan || 1);
    const sum = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
    cell.setAttribute("data-width", String(Math.round(sum * 10) / 10));
    col += span;
  }
  layoutTable(table);
}

/** Cursore nella cella: alla fine del testo (o all'inizio se è vuota). */
export function placeCaret(cell: HTMLElement, atEnd = true): void {
  const range = document.createRange();
  range.selectNodeContents(cell);
  const empty = (cell.textContent ?? "").replace(/​/g, "") === "";
  range.collapse(!atEnd || empty);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  cell.closest<HTMLElement>("[contenteditable='true']")?.focus({ preventScroll: true });
  cell.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/**
 * Tab / Shift+Tab nella tabella: cella successiva o precedente. Tab nell'ultima cella aggiunge
 * una riga. Restituisce "riga" se la tabella è cambiata (va salvata), altrimenti "mosso".
 */
export function moveToCell(cell: CellEl, direction: 1 | -1): "mosso" | "riga" {
  const table = cell.closest("table");
  if (!table) return "mosso";
  const { model, idOf } = readTable(table);
  const order = cellOrder(model);
  const id = idOf.get(cell);
  const at = id === undefined ? -1 : order.indexOf(id);
  const target = order[at + direction];
  if (target !== undefined) {
    const el = Array.from(idOf.entries()).find(([, v]) => v === target)?.[0];
    if (el) placeCaret(el);
    return "mosso";
  }
  if (direction < 0) return "mosso";
  const next = insertRow(model, rowCount(model));
  const written = replaceTable(table, next);
  const first = written.cellOf.get(next.grid[rowCount(next) - 1][0]);
  if (first) placeCaret(first, false);
  return "riga";
}

/** Rettangolo (in posti della griglia) tra due celle della stessa tabella. */
export function rectBetween(model: TableModel, a: number, b: number) {
  const ba = boxOf(model, a);
  const bb = boxOf(model, b);
  if (!ba || !bb) return null;
  return {
    r0: Math.min(ba.row, bb.row),
    c0: Math.min(ba.col, bb.col),
    r1: Math.max(ba.row + ba.rowspan - 1, bb.row + bb.rowspan - 1),
    c1: Math.max(ba.col + ba.colspan - 1, bb.col + bb.colspan - 1),
  };
}
