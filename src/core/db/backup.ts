import { invoke } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";
import { getDatabase } from "./client";
import { MIGRATIONS } from "./migrations";
import { isAndroid } from "../system/platform";

/**
 * Copia di sicurezza di tutto il database (`dashboard.db`), con i comandi di src-tauri/src/db_backup.rs:
 * - `exportDatabase(target)`: copia coerente fatta da SQLite (`VACUUM INTO`), scritta nel file scelto;
 * - `importDatabase(source)`: controlla il file, chiude il DB, lo sostituisce e ricarica la pagina (le migrazioni lo
 *   portano all'ultima versione). Gli identificativi di questo dispositivo per i Gruppi (`cloud_device_id:*`)
 *   restano quelli di prima: il file può venire da un altro dispositivo.
 * Gli allegati del Quaderno (file nella cartella delle note) non ci sono: stanno fuori dal DB.
 * I file arrivano dal selettore: sul desktop un percorso, su Android un URI `content://`.
 */

/** Errore con una frase fissa in italiano dai comandi Rust, da mostrare così com'è. */
export class BackupError extends Error {}

function backupError(error: unknown, fallback: string): BackupError {
  return new BackupError(typeof error === "string" ? error : fallback);
}

const LATEST_VERSION = Math.max(...MIGRATIONS.map((m) => m.version));

/** Chiave del `localStorage` con le righe di `meta` da rimettere dopo l'importazione (sopravvive al ricaricamento). */
const KEEP_KEY = "pd-import-keep-meta";

/** Filtro dei selettori dei file: su Android i .db non hanno un tipo noto e il filtro li nasconderebbe. */
export const BACKUP_FILE_FILTERS = isAndroid() ? undefined : [{ name: "Database", extensions: ["db"] }];

/** Nome proposto per il file esportato, con la data di oggi. */
export function exportFileName(now = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `personalDashboard-${day}.db`;
}

export async function exportDatabase(target: string): Promise<void> {
  const db = await getDatabase();
  try {
    const temp = await invoke<string>("db_export_prepare");
    await db.execute("VACUUM INTO ?", [temp]);
    await invoke("db_export_save", { target });
  } catch (error) {
    throw backupError(error, "Esportazione non riuscita");
  }
}

/** Sostituisce il DB con il file scelto. Se riesce la pagina si ricarica e la promise non si risolve. */
export async function importDatabase(source: string): Promise<void> {
  try {
    await invoke("db_import_stage", { source, maxVersion: LATEST_VERSION });
  } catch (error) {
    throw backupError(error, "Importazione non riuscita");
  }
  const db = await getDatabase();
  const keep = await db.select<{ key: string; value: string }[]>(`SELECT key, value FROM meta WHERE key LIKE 'cloud_device_id:%'`);
  try {
    localStorage.setItem(KEEP_KEY, JSON.stringify(keep));
  } catch {
    // senza localStorage il dispositivo prende gli identificativi del file: i Gruppi funzionano lo stesso
  }
  await db.close();
  try {
    await invoke("db_import_apply");
  } finally {
    // chiuso il DB l'app si riparte comunque: con il DB nuovo, o con quello di prima se la sostituzione è fallita
    location.reload();
  }
}

/** Dopo le migrazioni: rimette le righe di `meta` di questo dispositivo salvate da `importDatabase`. */
export async function restoreKeptMeta(db: Database): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEEP_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const rows = JSON.parse(raw) as { key: string; value: string }[];
    for (const row of rows) {
      if (typeof row?.key !== "string" || typeof row.value !== "string" || !row.key.startsWith("cloud_device_id:")) continue;
      await db.execute(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [row.key, row.value]);
    }
  } catch (error) {
    console.error("Identificativi del dispositivo non ripristinati:", error);
  }
  try {
    localStorage.removeItem(KEEP_KEY);
  } catch {
    // niente
  }
}
