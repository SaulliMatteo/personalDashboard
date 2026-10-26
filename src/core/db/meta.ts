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

/**
 * Identificativo casuale di questo computer per i Gruppi (uuid), uno per account: creato la prima volta e poi
 * sempre lo stesso. Non dice nulla del computer; serve al server per sommare i totali di più dispositivi dello
 * stesso utente. Per account perché sul server un dispositivo appartiene a un solo utente.
 */
export async function getDeviceId(userId: string): Promise<string> {
  const key = `cloud_device_id:${userId}`;
  const saved = await getMeta(key);
  if (saved) return saved;
  const id = crypto.randomUUID();
  await setMeta(key, id);
  return id;
}
