import { collides } from "react-grid-layout/core";
import type { Compactor, Layout } from "react-grid-layout/core";

let activeItemId: string | null = null;
let maxRowsState = Infinity;
const collisionTimers = new Map<string, number>();
const PUSH_DELAY_MS = 600;

let lastSafePosition: { x: number; y: number } | null = null;

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

export function setActiveItem(id: string | null, initialPosition?: { x: number; y: number }) {
  activeItemId = id;
  collisionTimers.clear();
  lastSafePosition = id && initialPosition ? { ...initialPosition } : null;
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

function resolveLayout(layout: Layout, cols: number, immediate: boolean): Layout {
  const items = layout.map((it) => ({ ...it }));
  const originalPositions = new Map(layout.map((it) => [it.i, { x: it.x, y: it.y }]));
  const now = Date.now();
  const seenThisRound = new Set<string>();

  if (!immediate && activeItemId) {
    const active = items.find((it) => it.i === activeItemId);
    if (active) {
      let blocked = false;
      for (const other of items) {
        if (other.i === activeItemId || other.static) continue;
        if (!collides(active, other)) continue;

        const key = pairKey(active.i, other.i);
        seenThisRound.add(key);
        const firstSeen = collisionTimers.get(key);
        if (firstSeen === undefined) {
          collisionTimers.set(key, now);
          blocked = true;
        } else if (now - firstSeen < PUSH_DELAY_MS) {
          blocked = true;
        }
      }

      if (blocked && lastSafePosition) {
        active.x = lastSafePosition.x;
        active.y = lastSafePosition.y;
      } else if (!blocked) {
        lastSafePosition = { x: active.x, y: active.y };
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

        if (!immediate && !(a.i === activeItemId || b.i === activeItemId)) {
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
          const aOrig = originalPositions.get(a.i)!;
          const bOrig = originalPositions.get(b.i)!;
          [fixed, moving] =
            aOrig.y < bOrig.y || (aOrig.y === bOrig.y && i < j) ? [a, b] : [b, a];
        }

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
    const beforeX = it.x, beforeY = it.y;
    it.x = Math.max(0, Math.min(it.x, cols - it.w));
    it.y = Math.max(0, Math.min(it.y, Math.max(0, maxRowsState - it.h)));
    if (it.x !== beforeX || it.y !== beforeY) {
      console.warn("[compactor] CLAMP APPLICATO:", { id: it.i, prima: { x: beforeX, y: beforeY }, dopo: { x: it.x, y: it.y }, maxRowsState, cols });
    }
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