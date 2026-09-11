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
  console.log(loadLayout())
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