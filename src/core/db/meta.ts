import { getDatabase } from "./client";

/** Piccolo store chiave/valore per metadati interni (non sono impostazioni utente). */
export async function getMeta(key: string): Promise<string | null> {
  const db = await getDatabase();
  const rows = await db.select<{ value: string }[]>(`SELECT value FROM meta WHERE key = ?`, [key]);
  return rows[0]?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}
