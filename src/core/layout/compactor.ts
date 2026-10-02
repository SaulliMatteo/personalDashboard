import { collides } from "react-grid-layout/core";
import type { Compactor, Layout } from "react-grid-layout/core";

/**
 * Compactor "spinta ritardata" per react-grid-layout.
 *
 * Differenza rispetto a prima: NON c'è più stato globale di modulo.
 * Lo stato di un drag (widget attivo, timer di collisione, ultima
 * posizione sicura) vive in una "sessione" creata da createDragCompactor,
 * quindi puoi avere più griglie, parametri diversi per griglia e testare
 * la logica in isolamento. La logica di risoluzione è invariata.
 */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragSession {
  activeId: string;
  /** Ultima posizione NOTA SENZA COLLISIONI del widget attivo. */
  lastSafeRect: Rect | null;
  collisionTimers: Map<string, number>;
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

/**
 * Risolve le collisioni. Con session === null (nessun drag in corso) la
 * risoluzione è immediata; altrimenti le spinte rispettano pushDelayMs.
 */
function resolveLayout(
  layout: Layout,
  cols: number,
  maxRows: number,
  pushDelayMs: number,
  session: DragSession | null
): Layout {
  const items = layout.map((it) => ({ ...it }));
  const rows = Math.max(1, maxRows);
  const activeId = session?.activeId ?? null;

  // Prima si sistema la taglia, poi si calcolano le collisioni con numeri
  // già validi (un widget troppo grande non deve spingere via gli altri).
  for (const it of items) {
    it.w = clamp(it.w, 1, cols);
    it.h = clamp(it.h, 1, rows);
  }

  const originalPositions = new Map(layout.map((it) => [it.i, { x: it.x, y: it.y }]));
  const now = Date.now();
  const seenThisRound = new Set<string>();

  if (session) {
    const timers = session.collisionTimers;
    const active = items.find((it) => it.i === session.activeId);
    if (active) {
      let blocked = false;

      for (const other of items) {
        if (other.i === session.activeId || other.static) continue;
        if (!collides(active, other)) continue;

        const key = pairKey(active.i, other.i);
        seenThisRound.add(key);
        const firstSeen = timers.get(key);
        const matured = firstSeen !== undefined && now - firstSeen >= pushDelayMs;
        if (firstSeen === undefined) timers.set(key, now);

        if (!matured) {
          blocked = true;
          continue;
        }

        // Matura: verifichiamo che "other" abbia DAVVERO un posto valido
        // dove atterrare (sotto o sopra) senza uscire dai bordi né toccare
        // un terzo widget. Se non c'è, blocchiamo il drag stesso.
        let candidateY = active.y + active.h;
        let fits = candidateY + other.h <= rows;
        if (!fits) {
          const above = active.y - other.h;
          if (above >= 0) {
            candidateY = above;
            fits = true;
          }
        }
        if (fits) {
          const candidate = { ...other, y: candidateY };
          const collidesWithThird = items.some(
            (third) =>
              third.i !== other.i &&
              third.i !== active.i &&
              !third.static &&
              collides(candidate, third)
          );
          if (collidesWithThird) fits = false;
        }
        if (!fits) blocked = true;
      }

      if (blocked && session.lastSafeRect) {
        // Torna all'ultima posizione sicura nota.
        active.x = session.lastSafeRect.x;
        active.y = session.lastSafeRect.y;
        active.w = session.lastSafeRect.w;
        active.h = session.lastSafeRect.h;
      } else if (!blocked) {
        session.lastSafeRect = { x: active.x, y: active.y, w: active.w, h: active.h };
      }
    }
  }

  let changed = true;
  let iterations = 0;
  const maxIterations = items.length * items.length + 10;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const a = items[i];
        const b = items[j];
        if (a.static || b.static) continue;
        if (!collides(a, b)) continue;

        const key = pairKey(a.i, b.i);
        seenThisRound.add(key);

        if (session && !(a.i === activeId || b.i === activeId)) {
          const firstSeen = session.collisionTimers.get(key);
          if (firstSeen === undefined) {
            session.collisionTimers.set(key, now);
            continue;
          }
          if (now - firstSeen < pushDelayMs) continue;
        }

        let fixed: typeof a;
        let moving: typeof a;
        if (a.i === activeId) {
          fixed = a;
          moving = b;
        } else if (b.i === activeId) {
          fixed = b;
          moving = a;
        } else {
          const aOrig = originalPositions.get(a.i)!;
          const bOrig = originalPositions.get(b.i)!;
          [fixed, moving] = aOrig.y < bOrig.y || (aOrig.y === bOrig.y && i < j) ? [a, b] : [b, a];
        }

        // Se rimettendo "moving" dov'era all'inizio non collide più con
        // nessuno, la spinta si annulla.
        const origPos = originalPositions.get(moving.i);
        if (origPos && (origPos.x !== moving.x || origPos.y !== moving.y)) {
          const candidate = { ...moving, x: origPos.x, y: origPos.y };
          const stillBlocked = items.some(
            (other) => other.i !== moving.i && !other.static && collides(candidate, other)
          );
          if (!stillBlocked) {
            moving.x = origPos.x;
            moving.y = origPos.y;
            changed = true;
            continue;
          }
        }

        let newY = fixed.y + fixed.h;
        if (newY + moving.h > rows) {
          const above = fixed.y - moving.h;
          newY = above >= 0 ? above : Math.max(0, rows - moving.h);
        }

        if (moving.y !== newY) {
          moving.y = newY;
          changed = true;
        }
      }
    }
  }

  if (session) {
    for (const key of session.collisionTimers.keys()) {
      if (!seenThisRound.has(key)) session.collisionTimers.delete(key);
    }
  }

  for (const it of items) {
    it.w = clamp(it.w, 1, cols);
    it.h = clamp(it.h, 1, rows);
    it.x = clamp(it.x, 0, cols - it.w);
    it.y = clamp(it.y, 0, Math.max(0, rows - it.h));
  }

  return items;
}

/** Risoluzione immediata, senza ritardi: per caricamento, reset, rilascio. */
export function finalizeLayout(layout: Layout, cols: number, maxRows: number): Layout {
  return resolveLayout(layout, cols, maxRows, 0, null);
}

export function clampToBounds(layout: Layout, cols: number, maxRows: number): Layout {
  return layout.map((it) => ({
    ...it,
    x: Math.max(0, Math.min(it.x, cols - it.w)),
    y: Math.max(0, Math.min(it.y, Math.max(0, maxRows - it.h))),
  }));
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

    /** rect: posizione del widget PRIMA di iniziare il drag (primo punto sicuro noto). */
    startDrag(id: string, rect?: Rect) {
      session = { activeId: id, lastSafeRect: rect ? { ...rect } : null, collisionTimers: new Map() };
    },

    endDrag() {
      session = null;
    },

    /** True se il widget attivo sta ancora sopra un altro senza che il ritardo sia maturato. */
    hasPendingCollision(layout: Layout, activeId: string): boolean {
      const now = Date.now();
      const active = layout.find((it) => it.i === activeId);
      if (!active) return false;

      for (const other of layout) {
        if (other.i === activeId || other.static) continue;
        if (!collides(active, other)) continue;
        const firstSeen = session?.collisionTimers.get(pairKey(active.i, other.i));
        if (firstSeen === undefined || now - firstSeen < config.pushDelayMs) return true;
      }
      return false;
    },
  };
}
