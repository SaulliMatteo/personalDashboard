import { collides } from "react-grid-layout/core";
import type { Compactor, Layout } from "react-grid-layout/core";

/**
 * Compactor "spinta ritardata" per react-grid-layout.
 *
 * Lo stato di un drag (widget attivo, layout di partenza, timer di
 * collisione, ultima posizione sicura) vive in una "sessione" creata da
 * createDragCompactor: niente stato globale di modulo, quindi più griglie
 * con parametri diversi e logica testabile in isolamento.
 *
 * Regola d'oro: il risultato non ha MAI sovrapposizioni. Chi deve far posto
 * va in una posizione libera (findPlacement) o, se non ce n'è, il drag si
 * blocca; al rilascio, nel peggiore dei casi, si torna al layout di partenza.
 */

type Item = Layout[number];

interface Cell {
  x: number;
  y: number;
}

interface Rect extends Cell {
  w: number;
  h: number;
}

interface DragSession {
  activeId: string;
  /** Layout all'inizio del drag: la "casa" dei widget spinti e il ripiego se il rilascio non si risolve. */
  originLayout: Item[];
  /** Ultima posizione NOTA SENZA COLLISIONI del widget attivo. */
  lastSafeRect: Rect | null;
  collisionTimers: Map<string, number>;
  /** Mouse rilasciato: ogni collisione conta come matura (lo scambio avviene subito). */
  dropping: boolean;
}

export interface CompactorConfig {
  /** Righe massime della griglia. */
  maxRows: number;
  /** Per quanto tempo un widget deve restare sopra un altro prima di spingerlo. */
  pushDelayMs: number;
}

function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Taglia e posizione dentro i bordi della griglia. */
function clampItem(it: Item, cols: number, rows: number) {
  it.w = clamp(it.w, 1, cols);
  it.h = clamp(it.h, 1, rows);
  it.x = clamp(it.x, 0, cols - it.w);
  it.y = clamp(it.y, 0, rows - it.h);
}

/** True se `moving` messo in `cell` sta nei bordi e non tocca nessun altro di `items`. */
function fitsAt(moving: Item, cell: Cell, items: readonly Item[], cols: number, rows: number): boolean {
  if (cell.x < 0 || cell.y < 0 || cell.x + moving.w > cols || cell.y + moving.h > rows) return false;
  const candidate = { ...moving, x: cell.x, y: cell.y };
  return !items.some((other) => other.i !== moving.i && collides(candidate, other));
}

/**
 * Dove mettere `moving` senza toccare nessuno: la prima delle `preferred` che
 * va bene, altrimenti la cella libera più vicina alla sua posizione attuale.
 * Null se nella griglia non c'è posto.
 */
function findPlacement(
  moving: Item,
  items: readonly Item[],
  preferred: readonly Cell[],
  cols: number,
  rows: number
): Cell | null {
  for (const cell of preferred) {
    if (fitsAt(moving, cell, items, cols, rows)) return cell;
  }
  let best: Cell | null = null;
  let bestDistance = Infinity;
  for (let y = 0; y + moving.h <= rows; y++) {
    for (let x = 0; x + moving.w <= cols; x++) {
      const distance = Math.abs(x - moving.x) + Math.abs(y - moving.y);
      if (distance < bestDistance && fitsAt(moving, { x, y }, items, cols, rows)) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * Toglie ogni sovrapposizione: i widget si sistemano uno alla volta (prima
 * `first`, poi dall'alto in basso) e chi tocca uno già sistemato va nella
 * cella libera più vicina. Su un layout già valido non cambia nulla.
 * False se qualcuno non trova posto (resta sovrapposto).
 */
function separate(items: Item[], cols: number, rows: number, first: string | null): boolean {
  const order = [...items].sort((a, b) => {
    if (a.i === first) return -1;
    if (b.i === first) return 1;
    return a.y - b.y || a.x - b.x;
  });
  const placed: Item[] = [];
  let ok = true;
  for (const it of order) {
    if (!it.static && !fitsAt(it, it, placed, cols, rows)) {
      const cell = findPlacement(it, placed, [], cols, rows);
      if (cell) {
        it.x = cell.x;
        it.y = cell.y;
      } else {
        ok = false;
      }
    }
    placed.push(it);
  }
  return ok;
}

/**
 * Risolve il layout durante un drag. Il widget attivo che copre altri widget:
 * finché la sovrapposizione non è "maturata" (pushDelayMs, o subito al
 * rilascio) resta all'ultima posizione sicura; poi chi sta sotto si sposta,
 * prima nella cella d'origine dell'attivo (scambio), poi sotto, poi sopra,
 * poi nel posto libero più vicino. Se qualcuno non ha posto, il drag si blocca.
 */
function resolveDrag(items: Item[], cols: number, rows: number, pushDelayMs: number, session: DragSession): Item[] | null {
  const active = items.find((it) => it.i === session.activeId);
  if (!active) return separate(items, cols, rows, null) ? items : null;

  const timers = session.collisionTimers;
  const now = Date.now();
  const seen = new Set<string>();
  const covered = items
    .filter((other) => other.i !== active.i && !other.static && collides(active, other))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  let blocked = false;
  for (const other of covered) {
    const key = pairKey(active.i, other.i);
    seen.add(key);
    const firstSeen = timers.get(key);
    if (firstSeen === undefined) timers.set(key, now);
    const matured = session.dropping || (firstSeen !== undefined && now - firstSeen >= pushDelayMs);
    if (!matured) blocked = true;
  }
  for (const key of timers.keys()) {
    if (!seen.has(key)) timers.delete(key);
  }

  if (!blocked) {
    // Le spinte si provano su una copia: se anche uno solo non trova posto, non si muove nessuno.
    const trial = items.map((it) => ({ ...it }));
    const trialActive = trial.find((it) => it.i === active.i)!;
    const origin = session.originLayout.find((it) => it.i === active.i);
    for (const other of covered) {
      const moving = trial.find((it) => it.i === other.i)!;
      const preferred: Cell[] = [
        // Scambio: nella cella d'origine dell'attivo, con la stessa posizione relativa
        // (un 2×2 che copre quattro 1×1 li ritrova nello stesso ordine al suo posto).
        ...(origin
          ? [
              { x: origin.x + (moving.x - trialActive.x), y: origin.y + (moving.y - trialActive.y) },
              { x: origin.x, y: origin.y },
            ]
          : []),
        { x: moving.x, y: trialActive.y + trialActive.h },
        { x: moving.x, y: trialActive.y - moving.h },
      ];
      const cell = findPlacement(moving, trial, preferred, cols, rows);
      if (!cell) {
        blocked = true;
        break;
      }
      moving.x = cell.x;
      moving.y = cell.y;
    }
    if (!blocked) items = trial;
  }

  const current = items.find((it) => it.i === session.activeId)!;
  if (blocked && session.lastSafeRect) {
    Object.assign(current, session.lastSafeRect);
  } else if (!blocked) {
    session.lastSafeRect = { x: current.x, y: current.y, w: current.w, h: current.h };
  }

  // Chi era stato spinto torna a casa appena il suo posto è di nuovo libero.
  let changed = true;
  while (changed) {
    changed = false;
    for (const it of items) {
      const home = session.originLayout.find((o) => o.i === it.i);
      if (!home || it.i === session.activeId || (home.x === it.x && home.y === it.y)) continue;
      if (fitsAt(it, home, items, cols, rows)) {
        it.x = home.x;
        it.y = home.y;
        changed = true;
      }
    }
  }

  return separate(items, cols, rows, session.activeId) ? items : null;
}

function resolveLayout(
  layout: Layout,
  cols: number,
  maxRows: number,
  pushDelayMs: number,
  session: DragSession | null
): Layout {
  const rows = Math.max(1, maxRows);
  const items = layout.map((it) => ({ ...it }));
  for (const it of items) clampItem(it, cols, rows);

  if (!session) {
    separate(items, cols, rows, null);
    return items;
  }

  const resolved = resolveDrag(items, cols, rows, pushDelayMs, session);
  if (resolved) return resolved;
  // Impossibile togliere le sovrapposizioni: si torna al layout di partenza.
  return session.originLayout.map((it) => ({ ...it }));
}

/** Risoluzione immediata, senza ritardi: per caricamento, reset, rilascio. */
export function finalizeLayout(layout: Layout, cols: number, maxRows: number): Layout {
  return resolveLayout(layout, cols, maxRows, 0, null);
}

/** Stesse posizioni e taglie per gli stessi widget (l'ordine non conta). */
export function sameLayout(a: Layout, b: Layout): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((it) => [it.i, it]));
  return a.every((it) => {
    const other = byId.get(it.i);
    return other !== undefined && other.x === it.x && other.y === it.y && other.w === it.w && other.h === it.h;
  });
}

export function createDragCompactor(config: CompactorConfig) {
  let session: DragSession | null = null;

  const compactor: Compactor = {
    type: null,
    allowOverlap: true,
    preventCollision: false,
    compact(layout: Layout, cols: number): Layout {
      return resolveLayout(layout, cols, config.maxRows, config.pushDelayMs, session);
    },
  };

  return {
    compactor,

    /** layout: com'era la griglia PRIMA del drag (casa dei widget spinti e ripiego). */
    startDrag(id: string, layout: Layout) {
      const origin = layout.find((it) => it.i === id);
      session = {
        activeId: id,
        originLayout: layout.map((it) => ({ ...it })),
        lastSafeRect: origin ? { x: origin.x, y: origin.y, w: origin.w, h: origin.h } : null,
        collisionTimers: new Map(),
        dropping: false,
      };
    },

    /** Mouse rilasciato: da qui ogni collisione si risolve subito. Va chiamata PRIMA del rilascio della libreria. */
    beginDrop() {
      if (session) session.dropping = true;
    },

    /** Risultato del rilascio calcolato a mano (rete di sicurezza se la libreria perde il rilascio). */
    dropResult(layout: Layout, cols: number): Layout {
      if (session) session.dropping = true;
      return resolveLayout(layout, cols, config.maxRows, config.pushDelayMs, session);
    },

    isActive(): boolean {
      return session !== null;
    },

    endDrag() {
      session = null;
    },
  };
}
