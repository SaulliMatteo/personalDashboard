import { getDatabase } from "../db";
import type { MobileItem } from "./mobileLayout";

/** Layout del telefono (tabella dashboard_layout_mobile): stesso schema di layoutRepository.ts, più la pagina. */

export async function saveMobileLayout(items: readonly MobileItem[]) {
  const db = await getDatabase();

  if (items.length === 0) {
    await db.execute(`DELETE FROM dashboard_layout_mobile`);
    return;
  }

  const rowPlaceholders = items.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
  await db.execute(
    `INSERT INTO dashboard_layout_mobile (widget_id, page, x, y, w, h)
     VALUES ${rowPlaceholders}
     ON CONFLICT(widget_id) DO UPDATE SET
       page = excluded.page, x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h`,
    items.flatMap((item) => [item.i, item.page, item.x, item.y, item.w, item.h])
  );

  // Upsert PRIMA, delete dopo: se l'app si chiude in mezzo, al peggio restano righe in più
  // (che sanitizeLayout sistema al prossimo avvio), mai un layout con widget mancanti.
  const idPlaceholders = items.map(() => "?").join(", ");
  await db.execute(
    `DELETE FROM dashboard_layout_mobile WHERE widget_id NOT IN (${idPlaceholders})`,
    items.map((item) => item.i)
  );
}

export async function loadMobileLayout(): Promise<MobileItem[]> {
  const db = await getDatabase();
  return db.select<MobileItem[]>(`SELECT widget_id AS i, page, x, y, w, h FROM dashboard_layout_mobile ORDER BY id`);
}
