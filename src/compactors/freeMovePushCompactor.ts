import { collides } from "react-grid-layout/core";
import type { Compactor, Layout } from "react-grid-layout/core";

let activeItemId: string | null = null;
let maxRowsState = Infinity;
const collisionTimers = new Map<string, number>();
const PUSH_DELAY_MS = 300;

function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

export function hasPendingCollision(layout: Layout, activeId: string): boolean {
  const now = Date.now();
  const active = layout.find((it) => it.i === activeId);
  if (!active) return false;

  for (const other of layout) {
    if (other.i === activeId || other.static) continue;
    if (!collides(active, other)) continue;

    const firstSeen = collisionTimers.get(pairKey(active.i, other.i));
    if (firstSeen === undefined || now - firstSeen < PUSH_DELAY_MS) {
      return true;
    }
  }
  return false;
}

export function setActiveItem(id: string | null) {
  activeItemId = id;
  collisionTimers.clear();
}

export function clampToBounds(layout: Layout, cols: number): Layout {
  return layout.map((it) => ({
    ...it,
    x: Math.max(0, Math.min(it.x, cols - it.w)),
    y: Math.max(0, Math.min(it.y, Math.max(0, maxRowsState - it.h))),
  }));
}

export function setGridBounds(maxRows: number) {
  maxRowsState = maxRows;
}

/**
 * Respinge "dragged" fuori dallo spazio occupato da "stationary", lungo
 * l'asse in cui si sovrappongono DI MENO — come se sbattesse contro un
 * muro e scivolasse lungo il bordo più vicino, invece di saltare a una
 * riga fissa. È l'effetto "non posso ancora entrare qui" usato durante
 * il periodo di attesa, PRIMA che la collisione maturi.
 */
function bounceOutOf(
  dragged: { x: number; y: number; w: number; h: number },
  stationary: { x: number; y: number; w: number; h: number },
  cols: number
): { x: number; y: number } {
  const overlapX =
    Math.min(dragged.x + dragged.w, stationary.x + stationary.w) -
    Math.max(dragged.x, stationary.x);
  const overlapY =
    Math.min(dragged.y + dragged.h, stationary.y + stationary.h) -
    Math.max(dragged.y, stationary.y);

  let { x, y } = dragged;

  if (overlapX < overlapY) {
    const draggedCenter = dragged.x + dragged.w / 2;
    const stationaryCenter = stationary.x + stationary.w / 2;
    x =
      draggedCenter < stationaryCenter
        ? Math.max(0, stationary.x - dragged.w)
        : Math.min(cols - dragged.w, stationary.x + stationary.w);
  } else {
    const draggedCenter = dragged.y + dragged.h / 2;
    const stationaryCenter = stationary.y + stationary.h / 2;
    y =
      draggedCenter < stationaryCenter
        ? Math.max(0, stationary.y - dragged.h)
        : Math.min(Math.max(0, maxRowsState - dragged.h), stationary.y + stationary.h);
  }

  return { x, y };
}

function resolveLayout(layout: Layout, cols: number, immediate: boolean): Layout {
  const items = layout.map((it) => ({ ...it }));
  const originalY = new Map(layout.map((it) => [it.i, it.y]));
  const now = Date.now();
  const seenThisRound = new Set<string>();

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

        const involvesActive = a.i === activeItemId || b.i === activeItemId;

        if (!immediate && involvesActive) {
          const firstSeen = collisionTimers.get(key);
          const matured = firstSeen !== undefined && now - firstSeen >= PUSH_DELAY_MS;

          if (firstSeen === undefined) {
            collisionTimers.set(key, now);
          }

          if (!matured) {
            // Non ancora maturata: il widget trascinato NON entra nello
            // spazio dell'altro, viene respinto fuori come contro un muro.
            // L'altro (stazionario) non si muove affatto finché non matura.
            const dragged = a.i === activeItemId ? a : b;
            const stationary = a.i === activeItemId ? b : a;
            const pos = bounceOutOf(dragged, stationary, cols);
            if (dragged.x !== pos.x || dragged.y !== pos.y) {
              dragged.x = pos.x;
              dragged.y = pos.y;
              changed = true;
            }
            continue;
          }
          // Maturata: prosegue sotto con la logica di spinta normale.
        } else if (!immediate) {
          // Coppia in cui NESSUNO dei due è il widget attivo (es. effetto
          // a catena indiretto): stesso ritardo, ma qui non c'è un
          // "dragged" ovvio da far rimbalzare — manteniamo il comportamento
          // di attesa silenziosa precedente.
          const firstSeen = collisionTimers.get(key);
          if (firstSeen === undefined) {
            collisionTimers.set(key, now);
            continue;
          }
          if (now - firstSeen < PUSH_DELAY_MS) {
            continue;
          }
        }

        let fixed, moving;
        if (a.i === activeItemId) {
          fixed = a;
          moving = b;
        } else if (b.i === activeItemId) {
          fixed = b;
          moving = a;
        } else {
          const aY = originalY.get(a.i)!;
          const bY = originalY.get(b.i)!;
          [fixed, moving] =
            aY < bY || (aY === bY && i < j) ? [a, b] : [b, a];
        }

        let newY = fixed.y + fixed.h;

        if (newY + moving.h > maxRowsState) {
          const above = fixed.y - moving.h;
          newY = above >= 0 ? above : Math.max(0, maxRowsState - moving.h);
        }

        if (moving.y !== newY) {
          moving.y = newY;
          changed = true;
        }
      }
    }
  }

  for (const key of collisionTimers.keys()) {
    if (!seenThisRound.has(key)) {
      collisionTimers.delete(key);
    }
  }

  for (const it of items) {
    it.x = Math.max(0, Math.min(it.x, cols - it.w));
    it.y = Math.max(0, Math.min(it.y, Math.max(0, maxRowsState - it.h)));
  }

  return items;
}

export function finalizeLayout(layout: Layout, cols: number): Layout {
  return resolveLayout(layout, cols, true);
}

export const freeMovePushCompactor: Compactor = {
  type: null,
  allowOverlap: true,
  preventCollision: false,

  compact(layout: Layout, cols: number): Layout {
    return resolveLayout(layout, cols, false);
  },
};