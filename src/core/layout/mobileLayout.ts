/**
 * Layout della dashboard sul telefono (docs/mockup/mobile/viste.html): pagine 2×4 da sfogliare, al massimo 5.
 * Logica pura (niente React né DB): la prova è scripts/layout/mobileLayout.test.mts.
 *
 * Regole:
 * - taglie del telefono: 1×1, 2×1, 1×2, 2×2 (le taglie del widget che ci stanno, vedi phoneSizes);
 * - un widget alto 2 parte da una riga pari: ogni pagina è fatta di due metà 2×2, così in orizzontale la
 *   stessa pagina si ridispone 4×2 (le due metà affiancate, vedi landscapeCell) senza un layout in più;
 * - mai sovrapposizioni: chi deve far posto va nella cella d'origine di chi si sposta, poi nel posto libero
 *   più vicino sulla stessa pagina, poi nel primo posto libero di qualunque pagina; se non c'è posto, nulla cambia.
 * È separato da `dashboard_layout` del desktop, che non legge né scrive.
 */

export const PHONE_COLS = 2;
export const PHONE_ROWS = 4;
export const MAX_PAGES = 5;

export interface MobileItem {
  i: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Cell {
  page: number;
  x: number;
  y: number;
}

/**
 * Le taglie di un widget che stanno sul telefono (al massimo 2×2), senza doppioni, nell'ordine del widget; `extra`
 * sono quelle che esistono solo sul telefono (`phoneSizes` della WidgetDefinition), messe in fondo.
 */
export function phoneSizes(sizes: readonly Size[], extra: readonly Size[] = []): Size[] {
  const out: Size[] = [];
  for (const s of [...sizes, ...extra]) {
    if (s.w <= PHONE_COLS && s.h <= 2 && !out.some((o) => o.w === s.w && o.h === s.h)) out.push({ w: s.w, h: s.h });
  }
  return out.length > 0 ? out : [{ w: 1, h: 1 }];
}

/** Taglia sul telefono per una taglia del desktop: la stessa se c'è, altrimenti la più grande che non la supera. */
export function phoneSizeFor(desktop: Size, allowed: readonly Size[]): Size {
  const exact = allowed.find((s) => s.w === desktop.w && s.h === desktop.h);
  if (exact) return exact;
  const smaller = allowed
    .filter((s) => s.w <= desktop.w && s.h <= desktop.h)
    .sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);
  return smaller[0] ?? allowed[0];
}

function overlaps(a: MobileItem, b: { page: number; x: number; y: number; w: number; h: number }): boolean {
  return a.page === b.page && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** `size` messo in `cell` sta nella pagina, rispetta la riga pari per gli alti 2 e non tocca nessuno di `items`. */
function fitsAt(size: Size, cell: Cell, items: readonly MobileItem[], ignore?: string): boolean {
  if (cell.page < 0 || cell.page >= MAX_PAGES) return false;
  if (cell.x < 0 || cell.y < 0 || cell.x + size.w > PHONE_COLS || cell.y + size.h > PHONE_ROWS) return false;
  if (size.h === 2 && cell.y % 2 !== 0) return false;
  const probe = { ...cell, ...size };
  return !items.some((other) => other.i !== ignore && overlaps(other, probe));
}

/** Primo posto libero (pagina, riga, colonna), a partire da `fromPage`. */
export function firstFree(size: Size, items: readonly MobileItem[], fromPage = 0): Cell | null {
  for (let page = fromPage; page < MAX_PAGES; page++) {
    for (let y = 0; y < PHONE_ROWS; y++) {
      for (let x = 0; x < PHONE_COLS; x++) {
        if (fitsAt(size, { page, x, y }, items)) return { page, x, y };
      }
    }
  }
  return null;
}

/** Posto libero più vicino a `near` sulla sua stessa pagina. */
function nearestOnPage(size: Size, near: Cell, items: readonly MobileItem[]): Cell | null {
  let best: Cell | null = null;
  let bestDistance = Infinity;
  for (let y = 0; y < PHONE_ROWS; y++) {
    for (let x = 0; x < PHONE_COLS; x++) {
      const cell = { page: near.page, x, y };
      const distance = Math.abs(x - near.x) + Math.abs(y - near.y);
      if (distance < bestDistance && fitsAt(size, cell, items)) {
        best = cell;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** Cella valida per `size` vicino a `cell`: dentro la pagina e, se alto 2, su una riga pari. */
function clampCell(size: Size, cell: Cell): Cell {
  const x = Math.max(0, Math.min(cell.x, PHONE_COLS - size.w));
  let y = Math.max(0, Math.min(cell.y, PHONE_ROWS - size.h));
  if (size.h === 2) y -= y % 2;
  return { page: Math.max(0, Math.min(cell.page, MAX_PAGES - 1)), x, y };
}

/**
 * Mette `moving` in `target` e fa posto: chi tocca va prima in `origin` (scambio), poi nel posto libero più
 * vicino sulla pagina, poi nel primo posto libero. Null se qualcuno non trova posto.
 */
function placeWithDisplacement(items: readonly MobileItem[], moving: MobileItem, target: Cell, origin: Cell | null): MobileItem[] | null {
  const placed = { ...moving, ...target };
  const others = items.filter((it) => it.i !== moving.i);
  const displaced = others.filter((it) => overlaps(it, placed)).sort((a, b) => a.y - b.y || a.x - b.x);
  const result: MobileItem[] = [...others.filter((it) => !displaced.includes(it)), placed];
  for (const it of displaced) {
    const size = { w: it.w, h: it.h };
    const cell =
      (origin && fitsAt(size, origin, result) ? origin : null) ??
      nearestOnPage(size, it, result) ??
      firstFree(size, result);
    if (!cell) return null;
    result.push({ ...it, ...cell });
  }
  return result;
}

/** Aggiunge un widget nel primo posto libero. Null se c'è già o se non c'è posto. */
export function addItem(items: readonly MobileItem[], id: string, size: Size): MobileItem[] | null {
  if (items.some((it) => it.i === id)) return null;
  const cell = firstFree(size, items);
  return cell ? [...items, { i: id, ...cell, ...size }] : null;
}

export function removeItem(items: readonly MobileItem[], id: string): MobileItem[] {
  return items.filter((it) => it.i !== id);
}

/** Sposta un widget su un'altra cella (anche di un'altra pagina). Se non si può, torna `items` com'era. */
export function moveItem(items: readonly MobileItem[], id: string, target: Cell): MobileItem[] {
  const moving = items.find((it) => it.i === id);
  if (!moving) return [...items];
  const cell = clampCell(moving, target);
  if (cell.page === moving.page && cell.x === moving.x && cell.y === moving.y) return [...items];
  const origin = { page: moving.page, x: moving.x, y: moving.y };
  return placeWithDisplacement(items, moving, cell, origin) ?? [...items];
}

/** Cambia la taglia di un widget restando dov'è (o il più vicino possibile). Se non si può, torna `items` com'era. */
export function resizeItem(items: readonly MobileItem[], id: string, size: Size): MobileItem[] {
  const current = items.find((it) => it.i === id);
  if (!current) return [...items];
  const resized = { ...current, ...size };
  const cell = clampCell(size, current);
  return placeWithDisplacement(items, resized, cell, null) ?? [...items];
}

/** Numero di pagine in uso (almeno 1). */
export function pageCount(items: readonly MobileItem[]): number {
  return items.reduce((max, it) => Math.max(max, it.page + 1), 1);
}

/** Toglie le pagine vuote rinumerando le altre (all'uscita dalla modifica). */
export function trimEmptyPages(items: readonly MobileItem[]): MobileItem[] {
  const used = [...new Set(items.map((it) => it.page))].sort((a, b) => a - b);
  return items.map((it) => ({ ...it, page: used.indexOf(it.page) }));
}

/**
 * Rende valido un layout letto dal DB: via i doppioni e i widget non ammessi, taglie dentro le ammesse,
 * e chi non sta al suo posto (fuori pagina o sovrapposto) va nel primo posto libero.
 */
export function sanitizeLayout(items: readonly MobileItem[], allowedSizes: (id: string) => Size[] | null): MobileItem[] {
  const out: MobileItem[] = [];
  const sorted = [...items].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  for (const raw of sorted) {
    const allowed = allowedSizes(raw.i);
    if (!allowed || out.some((it) => it.i === raw.i)) continue;
    const size = allowed.some((s) => s.w === raw.w && s.h === raw.h) ? { w: raw.w, h: raw.h } : phoneSizeFor(raw, allowed);
    const cell = { page: raw.page, x: raw.x, y: raw.y };
    const where = fitsAt(size, cell, out) ? cell : firstFree(size, out);
    if (where) out.push({ i: raw.i, ...where, ...size });
  }
  return out;
}

/** Layout di partenza: i widget nell'ordine dato, ognuno nel primo posto libero. */
export function packLayout(entries: readonly { id: string; size: Size }[]): MobileItem[] {
  let items: MobileItem[] = [];
  for (const { id, size } of entries) items = addItem(items, id, size) ?? items;
  return items;
}

/**
 * Posizione nella griglia CSS (colonna e riga da 1) di una cella della pagina. In verticale è la 2×4; in
 * orizzontale la metà alta (righe 0-1) va a sinistra e quella bassa (righe 2-3) a destra, in una 4×2.
 */
export function gridPlacement(item: Pick<MobileItem, "x" | "y">, landscape: boolean): { col: number; row: number } {
  if (!landscape) return { col: item.x + 1, row: item.y + 1 };
  const half = item.y >= 2 ? 1 : 0;
  return { col: item.x + half * PHONE_COLS + 1, row: item.y - half * 2 + 1 };
}

/** Cella della pagina sotto un punto della griglia, dalla colonna e dalla riga CSS (da 0). Inversa di gridPlacement. */
export function cellFromGrid(col: number, row: number, landscape: boolean): { x: number; y: number } {
  if (!landscape) return { x: col, y: row };
  const half = col >= PHONE_COLS ? 1 : 0;
  return { x: col - half * PHONE_COLS, y: row + half * 2 };
}
