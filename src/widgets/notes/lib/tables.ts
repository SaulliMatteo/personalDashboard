/**
 * Tabelle nella pagina: modello PURO (niente DOM), su cui lavorano i comandi della tabella.
 *
 * La tabella è una griglia R×C di "posti": ogni posto contiene l'id della cella che lo occupa.
 * Una cella unita occupa un rettangolo di posti. Così inserire, eliminare, unire, dividere e
 * ordinare sono operazioni sulla griglia; colspan e rowspan si ricalcolano solo alla fine
 * (layoutRows). La lettura e la scrittura dell'HTML stanno in lib/tableDom.ts.
 */

export type CellAlign = "left" | "center" | "right";

export interface CellData {
  /** HTML del contenuto (già ripulito: viene dall'editor o da sanitizeHtml). */
  html: string;
  /** null = a sinistra (il valore predefinito, non scritto nell'HTML). */
  align: CellAlign | null;
}

export interface TableModel {
  /** La prima riga è l'intestazione (<thead> con <th>). */
  head: boolean;
  /** grid[riga][colonna] = id della cella. */
  grid: number[][];
  cells: Record<number, CellData>;
  /** Larghezza di ogni colonna in % della tabella; null = automatica. */
  widths: (number | null)[];
}

/** Una cella con il suo rettangolo nella griglia. */
export interface CellBox {
  id: number;
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

/** Una cella com'è nell'HTML (riga per riga, da sinistra). */
export interface RawCell {
  html: string;
  colspan: number;
  rowspan: number;
  align: CellAlign | null;
  /** data-width, solo sulle celle della prima riga. */
  width: number | null;
}

export const MAX_SPAN = 20;
export const MIN_WIDTH = 5;
/** Contenuto di una cella vuota: il <br> tiene la riga alta e il cursore ci entra. */
export const EMPTY_CELL = "<br>";

const emptyCell = (): CellData => ({ html: EMPTY_CELL, align: null });

export function rowCount(m: TableModel): number {
  return m.grid.length;
}

export function colCount(m: TableModel): number {
  return m.grid[0]?.length ?? 0;
}

function copy(m: TableModel): TableModel {
  const cells: Record<number, CellData> = {};
  for (const [id, c] of Object.entries(m.cells)) cells[Number(id)] = { ...c };
  return { head: m.head, grid: m.grid.map((r) => [...r]), cells, widths: [...m.widths] };
}

function newId(m: TableModel): number {
  let max = 0;
  for (const id of Object.keys(m.cells)) max = Math.max(max, Number(id));
  return max + 1;
}

/** Toglie le celle che non occupano più nessun posto. */
function prune(m: TableModel): TableModel {
  const used = new Set(m.grid.flat());
  for (const id of Object.keys(m.cells)) if (!used.has(Number(id))) delete m.cells[Number(id)];
  return m;
}

export function createTable(rows: number, cols: number, head = true): TableModel {
  const m: TableModel = { head, grid: [], cells: {}, widths: Array.from({ length: cols }, () => null) };
  let id = 1;
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      m.cells[id] = emptyCell();
      row.push(id++);
    }
    m.grid.push(row);
  }
  return m;
}

// ---------------------------------------------------------------------
// Da e verso la forma dell'HTML
// ---------------------------------------------------------------------

const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)));

/**
 * Dalle righe dell'HTML alla griglia (algoritmo delle tabelle HTML: ogni cella va nel primo
 * posto libero della sua riga). I posti rimasti vuoti diventano celle vuote. `ids[r][i]` è l'id
 * dato alla i-esima cella della riga r (serve a ritrovare la cella del DOM).
 */
export function fromRows(rows: RawCell[][], head: boolean): { model: TableModel; ids: number[][] } {
  const R = rows.length;
  const slots: (number | undefined)[][] = rows.map(() => []);
  const cells: Record<number, CellData> = {};
  const ids: number[][] = [];
  const widths: (number | null)[] = [];
  let id = 1;
  rows.forEach((row, r) => {
    const rowIds: number[] = [];
    let c = 0;
    for (const raw of row) {
      while (slots[r][c] !== undefined) c++;
      const rs = clampInt(raw.rowspan, 1, Math.min(MAX_SPAN, R - r));
      const cs = clampInt(raw.colspan, 1, MAX_SPAN);
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) slots[r + dr][c + dc] = id;
      if (r === 0 && raw.width !== null) for (let dc = 0; dc < cs; dc++) widths[c + dc] = raw.width / cs;
      cells[id] = { html: raw.html, align: raw.align };
      rowIds.push(id++);
      c += cs;
    }
    ids.push(rowIds);
  });
  const C = Math.max(1, ...slots.map((r) => r.length));
  const grid: number[][] = [];
  for (let r = 0; r < Math.max(1, R); r++) {
    const row: number[] = [];
    for (let c = 0; c < C; c++) {
      let v = slots[r]?.[c];
      if (v === undefined) {
        v = id++;
        cells[v] = emptyCell();
      }
      row.push(v);
    }
    grid.push(row);
  }
  const model: TableModel = {
    head: head && grid.length > 0,
    grid,
    cells,
    widths: Array.from({ length: C }, (_, c) => widths[c] ?? null),
  };
  model.widths = normalizeWidths(model.widths);
  return { model: fixHead(model), ids };
}

/** Le celle con il loro rettangolo, in ordine di lettura (riga, poi colonna). */
export function cellBoxes(m: TableModel): CellBox[] {
  const seen = new Map<number, CellBox>();
  m.grid.forEach((row, r) =>
    row.forEach((id, c) => {
      const box = seen.get(id);
      if (!box) seen.set(id, { id, row: r, col: c, rowspan: 1, colspan: 1 });
      else {
        box.rowspan = Math.max(box.rowspan, r - box.row + 1);
        box.colspan = Math.max(box.colspan, c - box.col + 1);
      }
    })
  );
  return [...seen.values()].sort((a, b) => a.row - b.row || a.col - b.col);
}

export function boxOf(m: TableModel, id: number): CellBox | null {
  return cellBoxes(m).find((b) => b.id === id) ?? null;
}

/** Per ogni riga, le celle che iniziano lì (da sinistra): la forma dell'HTML. */
export function layoutRows(m: TableModel): CellBox[][] {
  const rows: CellBox[][] = m.grid.map(() => []);
  for (const box of cellBoxes(m)) rows[box.row].push(box);
  return rows;
}

/** Ordine delle celle per Tab / Shift+Tab. */
export function cellOrder(m: TableModel): number[] {
  return cellBoxes(m).map((b) => b.id);
}

/**
 * Larghezze coerenti: se almeno una colonna ha una larghezza, tutte ne hanno una (le altre si
 * dividono il resto) e la somma fa 100. Se nessuna ce l'ha, restano automatiche.
 */
export function normalizeWidths(widths: (number | null)[]): (number | null)[] {
  if (widths.every((w) => w === null) || widths.length === 0) return widths.map(() => null);
  const known = widths.filter((w): w is number => w !== null);
  const sum = known.reduce((a, b) => a + b, 0);
  const unknown = widths.length - known.length;
  const share = unknown > 0 ? Math.max(MIN_WIDTH, (100 - sum) / unknown) : 0;
  const filled = widths.map((w) => Math.max(MIN_WIDTH, w ?? share));
  const total = filled.reduce((a, b) => a + b, 0);
  return filled.map((w) => Math.round((w / total) * 1000) / 10);
}

/** Con l'intestazione, nessuna cella può stare a cavallo tra la prima riga e le altre: si divide. */
function fixHead(m: TableModel): TableModel {
  if (!m.head || m.grid.length < 2) return m;
  const top = new Set(m.grid[0]);
  for (let r = 1; r < m.grid.length; r++) {
    for (let c = 0; c < m.grid[r].length; c++) {
      if (top.has(m.grid[r][c])) {
        const id = newId(m);
        m.cells[id] = emptyCell();
        // Ogni posto sotto l'intestazione diventa una cella vuota a sé.
        m.grid[r][c] = id;
      }
    }
  }
  return m;
}

// ---------------------------------------------------------------------
// Righe e colonne
// ---------------------------------------------------------------------

/** Nuova riga vuota in posizione `at` (0 = in cima). Le celle unite che la attraversano si allungano. */
export function insertRow(model: TableModel, at: number): TableModel {
  const m = copy(model);
  const R = rowCount(m);
  const pos = clampInt(at, 0, R);
  const row: number[] = [];
  for (let c = 0; c < colCount(m); c++) {
    const across = pos > 0 && pos < R && m.grid[pos - 1][c] === m.grid[pos][c];
    if (across) row.push(m.grid[pos][c]);
    else {
      const id = newId(m);
      m.cells[id] = { html: EMPTY_CELL, align: m.cells[m.grid[Math.min(pos, R - 1)][c]]?.align ?? null };
      row.push(id);
    }
  }
  m.grid.splice(pos, 0, row);
  return fixHead(m);
}

/** Toglie la riga `r`. Null = era l'ultima: la tabella va eliminata. */
export function deleteRow(model: TableModel, r: number): TableModel | null {
  if (rowCount(model) <= 1) return null;
  const m = copy(model);
  m.grid.splice(clampInt(r, 0, rowCount(m) - 1), 1);
  return fixHead(prune(m));
}

/** Nuova colonna vuota in posizione `at` (0 = a sinistra). */
export function insertCol(model: TableModel, at: number): TableModel {
  const m = copy(model);
  const C = colCount(m);
  const pos = clampInt(at, 0, C);
  m.grid.forEach((row) => {
    const across = pos > 0 && pos < C && row[pos - 1] === row[pos];
    if (across) row.splice(pos, 0, row[pos]);
    else {
      const id = newId(m);
      m.cells[id] = emptyCell();
      row.splice(pos, 0, id);
    }
  });
  if (m.widths.some((w) => w !== null)) {
    const share = 100 / (C + 1);
    const scaled = normalizeWidths(m.widths).map((w) => ((w ?? 0) * C) / (C + 1));
    scaled.splice(pos, 0, share);
    m.widths = normalizeWidths(scaled);
  } else m.widths.splice(pos, 0, null);
  return m;
}

/** Toglie la colonna `c`. Null = era l'ultima: la tabella va eliminata. */
export function deleteCol(model: TableModel, c: number): TableModel | null {
  if (colCount(model) <= 1) return null;
  const m = copy(model);
  const pos = clampInt(c, 0, colCount(m) - 1);
  m.grid.forEach((row) => row.splice(pos, 1));
  m.widths.splice(pos, 1);
  m.widths = normalizeWidths(m.widths);
  return prune(m);
}

// ---------------------------------------------------------------------
// Unire e dividere
// ---------------------------------------------------------------------

export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** Il rettangolo allargato finché ogni cella che tocca ci sta dentro per intero. */
export function expandRect(m: TableModel, rect: Rect): Rect {
  let { r0, c0, r1, c1 } = { r0: Math.min(rect.r0, rect.r1), c0: Math.min(rect.c0, rect.c1), r1: Math.max(rect.r0, rect.r1), c1: Math.max(rect.c0, rect.c1) };
  const boxes = cellBoxes(m);
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of boxes) {
      const br1 = b.row + b.rowspan - 1;
      const bc1 = b.col + b.colspan - 1;
      const touches = b.row <= r1 && br1 >= r0 && b.col <= c1 && bc1 >= c0;
      if (!touches) continue;
      if (b.row < r0 || br1 > r1 || b.col < c0 || bc1 > c1) {
        r0 = Math.min(r0, b.row);
        c0 = Math.min(c0, b.col);
        r1 = Math.max(r1, br1);
        c1 = Math.max(c1, bc1);
        changed = true;
      }
    }
  }
  return { r0, c0, r1, c1 };
}

/** Testo di una cella (per ordinare e per sapere se è vuota). */
export function cellText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export type MergeResult = { ok: true; model: TableModel; id: number } | { ok: false; reason: "una-cella" | "intestazione" };

/** Unisce le celle del rettangolo (allargato alle celle già unite). Il testo si mette in fila. */
export function mergeCells(model: TableModel, rect: Rect): MergeResult {
  const m = copy(model);
  const { r0, c0, r1, c1 } = expandRect(m, rect);
  const id = m.grid[r0][c0];
  const inside: number[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (!inside.includes(m.grid[r][c])) inside.push(m.grid[r][c]);
  if (inside.length < 2) return { ok: false, reason: "una-cella" };
  if (m.head && r0 === 0 && r1 > 0) return { ok: false, reason: "intestazione" };
  const parts = inside.map((i) => m.cells[i].html).filter((h) => cellText(h) !== "");
  m.cells[id] = { html: parts.length > 0 ? parts.join("<br>") : EMPTY_CELL, align: m.cells[id].align };
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) m.grid[r][c] = id;
  return { ok: true, model: prune(m), id };
}

/** Divide una cella unita: il contenuto resta nel primo posto, gli altri diventano celle vuote. */
export function splitCell(model: TableModel, id: number): TableModel {
  const m = copy(model);
  const box = boxOf(m, id);
  if (!box) return m;
  for (let r = box.row; r < box.row + box.rowspan; r++) {
    for (let c = box.col; c < box.col + box.colspan; c++) {
      if (r === box.row && c === box.col) continue;
      const nid = newId(m);
      m.cells[nid] = { html: EMPTY_CELL, align: m.cells[id].align };
      m.grid[r][c] = nid;
    }
  }
  return m;
}

export function isMerged(m: TableModel, id: number): boolean {
  const box = boxOf(m, id);
  return !!box && (box.rowspan > 1 || box.colspan > 1);
}

// ---------------------------------------------------------------------
// Ordinare, allineare, intestazione, larghezze
// ---------------------------------------------------------------------

const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

/**
 * Ordina le righe (non l'intestazione) secondo la colonna `col`; le celle vuote vanno in fondo.
 * Null se non si può: meno di due righe, o celle unite su più righe.
 */
export function sortRows(model: TableModel, col: number, dir: 1 | -1): TableModel | null {
  const m = copy(model);
  const start = m.head ? 1 : 0;
  const body = m.grid.slice(start);
  if (body.length < 2) return null;
  for (let r = 0; r < body.length - 1; r++) {
    if (body[r].some((id) => body[r + 1].includes(id))) return null;
  }
  const c = clampInt(col, 0, colCount(m) - 1);
  const key = (row: number[]) => cellText(m.cells[row[c]].html);
  body.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (!ka || !kb) return ka ? -1 : kb ? 1 : 0;
    return collator.compare(ka, kb) * dir;
  });
  m.grid = [...m.grid.slice(0, start), ...body];
  return m;
}

/** Allinea tutte le celle della colonna (null = a sinistra). */
export function alignColumn(model: TableModel, col: number, align: CellAlign | null): TableModel {
  const m = copy(model);
  for (const row of m.grid) {
    const id = row[clampInt(col, 0, colCount(m) - 1)];
    m.cells[id].align = align === "left" ? null : align;
  }
  return m;
}

/** L'allineamento della colonna, se tutte le sue celle lo condividono. */
export function columnAlign(m: TableModel, col: number): CellAlign | null {
  const aligns = new Set(m.grid.map((row) => m.cells[row[col]]?.align ?? null));
  return aligns.size === 1 ? [...aligns][0] : null;
}

export function setHead(model: TableModel, on: boolean): TableModel {
  const m = copy(model);
  m.head = on;
  return fixHead(m);
}

/** Larghezze delle colonne (in %; null = tutte automatiche). */
export function setWidths(model: TableModel, widths: (number | null)[] | null): TableModel {
  const m = copy(model);
  m.widths = widths ? normalizeWidths(widths.slice(0, colCount(m))) : m.widths.map(() => null);
  return m;
}

/**
 * Nuove larghezze trascinando il confine tra la colonna `c` e la `c + 1`: le due si scambiano
 * spazio, le altre non cambiano. `px` = larghezze attuali in pixel, `dx` = spostamento.
 */
export function dragBoundary(px: number[], c: number, dx: number, minPx: number): number[] {
  const out = [...px];
  if (c < 0 || c + 1 >= out.length) return out;
  const pair = out[c] + out[c + 1];
  const left = Math.min(pair - minPx, Math.max(minPx, out[c] + dx));
  out[c] = left;
  out[c + 1] = pair - left;
  const total = out.reduce((a, b) => a + b, 0) || 1;
  return out.map((w) => Math.round((w / total) * 1000) / 10);
}

// ---------------------------------------------------------------------
// Markdown (GFM)
// ---------------------------------------------------------------------

/**
 * La tabella in Markdown GFM. Le celle unite si ripetono vuote; senza intestazione la prima riga
 * del Markdown è vuota (GFM la vuole sempre). `cellMd` converte l'HTML di una cella.
 */
export function tableToMarkdown(m: TableModel, cellMd: (html: string) => string): string {
  const C = colCount(m);
  if (C === 0) return "";
  const origin = new Map<number, string>();
  for (const b of cellBoxes(m)) origin.set(b.id, `${b.row}:${b.col}`);
  const text = (r: number, c: number) => {
    const id = m.grid[r][c];
    if (origin.get(id) !== `${r}:${c}`) return "";
    return cellMd(m.cells[id].html).replace(/\|/g, "\\|").replace(/\n+/g, "<br>").trim();
  };
  const line = (cols: string[]) => `| ${cols.join(" | ")} |`;
  const rows = m.grid.map((_, r) => Array.from({ length: C }, (_, c) => text(r, c)));
  const header = m.head ? rows.shift() ?? [] : Array.from({ length: C }, () => "");
  const sep = Array.from({ length: C }, (_, c) => {
    const a = columnAlign(m, c);
    return a === "center" ? ":---:" : a === "right" ? "---:" : "---";
  });
  return [line(header), line(sep), ...rows.map(line)].join("\n");
}
