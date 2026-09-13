import { collides } from "react-grid-layout/core";
import type { Compactor, Layout } from "react-grid-layout/core";

/**
 * Compactor "libero con spinta".
 *
 * L'interfaccia Compactor espone SOLO `compact(layout, cols)` — non esiste
 * un hook separato per "solo il widget appena spostato" (la versione
 * precedente di questo file assumeva un `onMove` che in realtà non esiste
 * nell'API della libreria). Quindi tutta la logica vive qui dentro.
 *
 * Cosa fa, e cosa NON fa, rispetto al compactor verticale di default:
 * - NON fa "fluttuare" i widget verso l'alto per riempire spazi vuoti:
 *   è quello il comportamento che causava la frizione di prima (dover
 *   girare intorno a un widget invece di scambiarlo direttamente).
 * - Risolve però le sovrapposizioni: se due widget si sovrappongono dopo
 *   un drag/resize, quello "più in basso" (o quello con indice maggiore,
 *   a parità di posizione) viene spinto subito sotto il bordo inferiore
 *   dell'altro. Ripete finché non restano collisioni (una spinta può
 *   crearne una nuova più sotto — es. A spinge B, B finisce per
 *   sovrapporsi a C, quindi spinge anche C).
 *
 * Limite noto: non conoscendo esplicitamente "quale widget hai appena
 * trascinato", la scelta di chi resta fermo e chi viene spinto si basa
 * sulla posizione (chi sta più in alto resta fermo) e, a parità, sull'
 * ordine nell'array. Nella grande maggioranza dei casi corrisponde
 * comunque a quello che ti aspetti (il widget che rilasci sopra un
 * altro lo spinge giù), ma se noti un caso in cui si comporta al
 * contrario, dimmelo con lo scenario esatto e affino la regola.
 */
export const freeMovePushCompactor: Compactor = {
  // null = nessuna compattazione automatica "di riempimento gap",
  // lo stesso valore usato internamente per noCompactor.
  type: null,
  allowOverlap: false,
  preventCollision: false,

  compact(layout: Layout, _cols: number): Layout {
    const items = layout.map((it) => ({ ...it }));

    let changed = true;
    let iterations = 0;
    const maxIterations = items.length * items.length + 10; // guardia anti-loop infinito

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

          const [fixed, moving] =
            a.y < b.y || (a.y === b.y && i < j) ? [a, b] : [b, a];

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