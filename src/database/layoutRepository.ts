import { getDatabase } from "./db";

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function saveLayout(layout: LayoutItem[]) {
  const db = await getDatabase();

  for (const item of layout) {
    await db.execute(
      `
      INSERT INTO dashboard_layout
        (widget_id, x, y, w, h)
      VALUES
        (?, ?, ?, ?, ?)
      ON CONFLICT(widget_id)
      DO UPDATE SET
        x = excluded.x,
        y = excluded.y,
        w = excluded.w,
        h = excluded.h
      `,
      [
        item.i,
        item.x,
        item.y,
        item.w,
        item.h,
      ]
    );
  }
}

/**
 * Rimuove un singolo widget dal layout salvato. Usata dal catalogo widget
 * quando l'utente toglie un widget dalla dashboard (a differenza di
 * saveLayout, che fa solo upsert e non cancella righe non più presenti
 * nell'array passato).
 */
export async function deleteWidget(id: string) {
  const db = await getDatabase();
  await db.execute(`DELETE FROM dashboard_layout WHERE widget_id = ?`, [id]);
}

export async function loadLayout(): Promise<LayoutItem[]> {
  const db = await getDatabase();

  const result = await db.select<LayoutItem[]>(
    `
    SELECT
      widget_id AS i,
      x,
      y,
      w,
      h
    FROM dashboard_layout
    ORDER BY id
    `
  );

  return result;
}