import { getDatabase } from "../db";

/** Lo sfondo di Vetro scelto su questo dispositivo (tabella `device_wallpaper`, non sincronizzata). */
export async function getWallpaper(): Promise<string | null> {
  const db = await getDatabase();
  const rows = await db.select<{ data_url: string }[]>(`SELECT data_url FROM device_wallpaper WHERE id = 1`);
  return rows[0]?.data_url ?? null;
}

export async function saveWallpaper(dataUrl: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO device_wallpaper (id, data_url, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_url = excluded.data_url, updated_at = excluded.updated_at`,
    [dataUrl, Date.now()]
  );
}

export async function clearWallpaper(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM device_wallpaper WHERE id = 1`);
}
