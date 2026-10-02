import { getDatabase } from "../db";

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function saveLayout(layout: LayoutItem[]) {
  const db = await getDatabase();

  if (layout.length === 0) {
    await db.execute(`DELETE FROM dashboard_layout`);
    return;
  }

  const rowPlaceholders = layout.map(() => "(?, ?, ?, ?, ?)").join(", ");
  await db.execute(
    `INSERT INTO dashboard_layout (widget_id, x, y, w, h)
     VALUES ${rowPlaceholders}
     ON CONFLICT(widget_id) DO UPDATE SET
       x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h`,
    layout.flatMap((item) => [item.i, item.x, item.y, item.w, item.h])
  );

  // Upsert PRIMA, delete dopo: se l'app si chiude in mezzo, al peggio
  // restano righe in più, mai un layout con widget mancanti.
  const idPlaceholders = layout.map(() => "?").join(", ");
  await db.execute(
    `DELETE FROM dashboard_layout WHERE widget_id NOT IN (${idPlaceholders})`,
    layout.map((item) => item.i)
  );
}

/** Rimuove un singolo widget dal layout salvato (usata dal catalogo). */
export async function deleteWidget(id: string) {
  const db = await getDatabase();
  await db.execute(`DELETE FROM dashboard_layout WHERE widget_id = ?`, [id]);
}

export async function loadLayout(): Promise<LayoutItem[]> {
  const db = await getDatabase();
  return db.select<LayoutItem[]>(
    `SELECT widget_id AS i, x, y, w, h FROM dashboard_layout ORDER BY id`
  );
}
