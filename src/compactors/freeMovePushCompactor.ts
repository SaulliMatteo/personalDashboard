import { collides } from "react-grid-layout/core";
import type { Compactor, Layout } from "react-grid-layout/core";

let activeItemId: string | null = null;
let maxRowsState = Infinity;
const collisionTimers = new Map<string, number>();
const PUSH_DELAY_MS = 600;

/**
 * Ultimo stato NOTO SENZA COLLISIONI del widget attivo — posizione E
 * dimensione insieme, perché durante un resize cambiano w/h (e a volte
 * anche x/y, se ridimensioni dai bordi sinistro/superiore), non solo x/y
 * come nel drag. Un unico rettangolo "sicuro" copre entrambi i casi.
 */
let lastSafeRect: { x: number; y: number; w: number; h: number } | null = null;

/**
 * True mentre l'interazione attiva è un RESIZE (non un drag). Cambia il
 * comportamento in caso di collisione: nel drag aspettiamo PUSH_DELAY_MS
 * prima di bloccare (per non scattare su sfioramenti accidentali); nel
 * resize invece blocchiamo SUBITO, sempre — non ha senso "aspettare" che
 * un ingrandimento verso uno spazio occupato diventi improvvisamente
 * valido, il blocco deve essere immediato e diretto come un muro.
 */
let isResizeMode = false;

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

/**
 * initialRect: stato (x,y,w,h) del widget PRIMA di iniziare l'interazione,
 * usato come primo punto sicuro noto.
 * resizing: true se l'interazione che sta per iniziare è un resize
 * (comportamento "muro immediato") invece di un drag ("muro con attesa").
 */
export function setActiveItem(
  id: string | null,
  initialRect?: { x: number; y: number; w: number; h: number },
  resizing = false
) {
  activeItemId = id;
  collisionTimers.clear();
  lastSafeRect = id && initialRect ? { ...initialRect } : null;
  isResizeMode = resizing;
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

  // Riduciamo SUBITO le dimensioni di ogni widget ai limiti fisici della
  // griglia, PRIMA di calcolare qualunque collisione. Senza questo, un
  // widget temporaneamente troppo grande (durante un resize che sta per
  // essere bloccato) potrebbe "spingere via" un altro usando la sua
  // altezza ancora sbagliata/enorme, mandandolo in una posizione assurda —
  // e solo DOPO, a spinta già avvenuta, ridurremmo la sua dimensione al
  // valore corretto. Prima si sistema la taglia, poi si calcolano le
  // collisioni con numeri già validi.
  for (const it of items) {
    it.w = Math.max(1, Math.min(it.w, cols));
    it.h = Math.max(1, Math.min(it.h, Math.max(1, maxRowsState)));
  }

  const originalPositions = new Map(layout.map((it) => [it.i, { x: it.x, y: it.y }]));
  const now = Date.now();
  const seenThisRound = new Set<string>();

  if (!immediate && activeItemId) {
    const active = items.find((it) => it.i === activeItemId);
    if (active) {
      let blocked = false;

      // Il resize deve bloccarsi anche contro i BORDI della griglia, non
      // solo contro altri widget: se stai ingrandendo verso uno spazio
      // vuoto ma oltre cols/maxRows, non c'è nessun collides() che lo
      // rilevi (non c'è nessuno lì contro cui scontrarsi), quindi va
      // controllato esplicitamente.
      if (isResizeMode && (active.x + active.w > cols || active.y + active.h > maxRowsState)) {
        blocked = true;
      }

      for (const other of items) {
        if (other.i === activeItemId || other.static) continue;
        if (!collides(active, other)) continue;

        if (isResizeMode) {
          // Resize: nessuna attesa, blocco immediato appena tocca qualcosa.
          blocked = true;
          continue;
        }

        const key = pairKey(active.i, other.i);
        seenThisRound.add(key);
        const firstSeen = collisionTimers.get(key);
        const matured = firstSeen !== undefined && now - firstSeen >= PUSH_DELAY_MS;
        if (firstSeen === undefined) {
          collisionTimers.set(key, now);
        }

        if (!matured) {
          blocked = true;
          continue;
        }

        // Matura: prima di lasciar procedere la spinta, verifichiamo che
        // "other" abbia DAVVERO un posto valido dove atterrare — sotto o,
        // se non c'è spazio, sopra — senza uscire dai bordi e senza
        // toccare un TERZO widget. Se non esiste una destinazione pulita,
        // blocchiamo il drag stesso qui: meglio fermarsi come contro un
        // muro che accettare una sovrapposizione forzata (il vecchio
        // comportamento "meglio sovrapposti che spariti" restava solo
        // come ultima rete di sicurezza, non come esito normale).
        let candidateY = active.y + active.h;
        let fits = candidateY + other.h <= maxRowsState;
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
        if (!fits) {
          blocked = true;
        }
      }

      if (blocked && lastSafeRect) {
        // Torna all'ultimo rettangolo sicuro INTERO (x,y,w,h insieme):
        // per il resize questo vuol dire "torna alla dimensione precedente
        // a questo passo", lasciando intatta la crescita avvenuta finora
        // nelle direzioni libere — solo il passo che avrebbe causato la
        // collisione viene annullato.
        active.x = lastSafeRect.x;
        active.y = lastSafeRect.y;
        active.w = lastSafeRect.w;
        active.h = lastSafeRect.h;
      } else if (!blocked) {
        lastSafeRect = { x: active.x, y: active.y, w: active.w, h: active.h };
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
    // Prima la dimensione: se w/h da soli superano lo spazio disponibile
    // (più widget di quanti la griglia possa contenere fisicamente), li
    // riduciamo — altrimenti il clamp di x/y sotto non avrebbe alcun
    // valore valido su cui atterrare.
    it.w = Math.max(1, Math.min(it.w, cols));
    it.h = Math.max(1, Math.min(it.h, Math.max(1, maxRowsState)));
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