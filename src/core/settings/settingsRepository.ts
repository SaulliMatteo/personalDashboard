import { getDatabase } from "../db";
import { DEFAULT_SETTINGS, sanitizeSettings, type AppSettings } from "./schema";

export async function loadSettings(): Promise<AppSettings> {
  try {
    const db = await getDatabase();
    const rows = await db.select<{ key: string; value: string }[]>(`SELECT key, value FROM settings`);
    const raw: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        raw[row.key] = JSON.parse(row.value);
      } catch {
        // riga illeggibile: viene semplicemente ignorata (ricade sul default)
      }
    }
    return sanitizeSettings(raw);
  } catch (error) {
    console.error("Errore nel caricamento delle impostazioni:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

/** Scrive solo le chiavi cambiate, in un unico statement. */
export async function saveSettingsPatch(patch: Partial<AppSettings>): Promise<void> {
  const entries = Object.entries(patch);
  if (entries.length === 0) return;
  try {
    const db = await getDatabase();
    const placeholders = entries.map(() => "(?, ?)").join(", ");
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ${placeholders}
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      entries.flatMap(([key, value]) => [key, JSON.stringify(value)])
    );
  } catch (error) {
    console.error("Errore nel salvataggio delle impostazioni:", error);
  }
}

export async function clearSettings(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.execute(`DELETE FROM settings`);
  } catch (error) {
    console.error("Errore nel ripristino delle impostazioni:", error);
  }
}
