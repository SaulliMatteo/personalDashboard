import { collides } from "react-grid-layout/core";
import type { Compactor, Layout } from "react-grid-layout/core";

/**
 * ID del widget attualmente sotto controllo dell'utente (drag o resize).
 * Vive fuori dal Compactor perché l'interfaccia Compactor.compact(layout, cols)
 * non prevede un terzo parametro per comunicare "quale item è quello attivo" —
 * quindi lo teniamo in un modulo-level state, aggiornato da Dashboard.tsx
 * tramite setActiveItem() a onDragStart/onDragStop/onResizeStart/onResizeStop.
 *
 * SENZA questo, compact() decide chi spostare guardando solo y/indice — e può
 * decidere di spostare proprio il widget che l'utente sta trascinando,
 * bloccandolo appena tocca un altro widget (bug osservato: "si alza di poco
 * e si ferma", perché ad ogni frame di drag viene rimesso lì a forza).
 */
let activeItemId: string | null = null;

export function setActiveItem(id: string | null) {
  activeItemId = id;
}

export const freeMovePushCompactor: Compactor = {
  type: null,
  allowOverlap: true,
  preventCollision: false,

  compact(layout: Layout, _cols: number): Layout {
    const items = layout.map((it) => ({ ...it }));

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

          let fixed, moving;
          if (a.i === activeItemId) {
            // a è il widget sotto controllo utente: non si tocca mai.
            fixed = a;
            moving = b;
          } else if (b.i === activeItemId) {
            fixed = b;
            moving = a;
          } else {
            // Nessuno dei due è quello attivo (es. effetto a catena su
            // altri widget spinti indirettamente): torna alla regola
            // originale basata su y/indice.
            [fixed, moving] =
              a.y < b.y || (a.y === b.y && i < j) ? [a, b] : [b, a];
          }

          const newY = fixed.y + fixed.h;
          if (moving.y !== newY) {
            moving.y = newY;
            changed = true;
          }
        }
      }
    }

    return items;
  },
};