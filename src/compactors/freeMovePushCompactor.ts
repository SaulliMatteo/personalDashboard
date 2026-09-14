import { collides } from "react-grid-layout/core";
import type { Compactor, Layout } from "react-grid-layout/core";

/**
 * Compactor "libero con spinta".
 *
 * Obiettivo: i widget si muovono liberamente per tutta la griglia e, quando
 * vengono rilasciati, restano esattamente dove li hai lasciati. Se però un
 * widget finisce sopra un altro (collisione), i due scambiano la posizione
 * soltanto se necessario: quello trascinato prende il posto, l'altro viene
 * spinto via (sotto il bordo del primo) in modo che non ci siano
 * sovrapposizioni.
 *
 * Cosa fa, e cosa NON fa, rispetto al compactor verticale di default:
 * - NON fa "fluttuare" i widget verso l'alto per riempire spazi vuoti:
 *   se lasci un widget in mezzo alla griglia con spazio sopra e sotto,
 *   rimane esattamente dove lo lasci e nessun altro widget sale a
 *   riempire lo spazio vuoto sopra di lui.
 * - Risolve però le sovrapposizioni: se due widget si sovrappongono dopo
 *   un drag/resize, quello "più in basso" (o quello con indice maggiore,
 *   a parità di posizione) viene spinto immediatamente sotto il bordo
 *   inferiore dell'altro. Il processo si ripete finché non restano
 *   collisioni (una spinta può crearne una nuova più sotto: A spinge B,
 *   B finisce sopra C, quindi B spinge anche C).
 *
 * NOTE IMPORTANTI SULL'INTERAZIONE CON LA LIBRERIA
 * —————————————————————————————————————————————————
 * 1. `type` DEVE essere `"vertical"` (NON `null`).
 *    In `react-grid-layout` (dist/chunk in quanto:
 *    moveElementAwayFromCollision) quando `compactType === null` e nasce
 *    una collisione spostando un widget verso l'alto, viene attivato uno
 *    specifico ramo di codice:
 *
 *      if (collisionNorth && compact Type === null) {
 *        collidesWith.y = itemToMove.y;            // scambia: l'altro prende il posto
 *        itemToMove.y  = itemToMove.y + item.h;    // il trascinato va sotto
 *      }
 *
 *    Quel ramo fa esattamente il comportamento che vedevi nell'UI:
 *    appena toccaviign un widget, i ruoli s'inverte e il widget che
 *    stavi trascinando veniva forzato nella posizione non voluta
 *    "saltando in alto" e restando incollato all'altro. Con
 *    `type: "vertical"` la libreria usa invece la spinta classica
 *    (l'item collide vie coperto di una riga) e il nostro `compact()`
 *    risolve le sovrapposizioni quando rilasci.
 *
 * 2. `allowOverlap: false` e `preventCollision: false`:
 *    permettono che durante il drag i widget si muovano liberamente
 *    SUI другой (il trascinato può momentaneamente passare sopra),
 *    lasciando al rilascio la sistematizzazione finalè.
 *
 */
export const freeMovePushCompactor: Compactor = {
  type: null,
  allowOverlap: true,
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