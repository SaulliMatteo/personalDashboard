import { getDatabase } from "./client";
import { MIGRATIONS } from "./migrations";

export { getDatabase } from "./client";
export { getMeta, setMeta } from "./meta";

// Promise condivisa: chiamarla più volte riusa la stessa esecuzione.
let initPromise: Promise<void> | null = null;

export function initializeDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = runMigrations().catch((error) => {
      initPromise = null; // permette un nuovo tentativo dopo un errore
      throw error;
    });
  }
  return initPromise;
}

async function runMigrations() {
  const db = await getDatabase();
  const rows = await db.select<{ user_version: number }[]>(`PRAGMA user_version`);
  const current = rows[0]?.user_version ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    for (const statement of migration.statements) {
      await db.execute(statement);
    }
    // PRAGMA non accetta parametri: il valore è una costante nostra, non input utente.
    await db.execute(`PRAGMA user_version = ${migration.version}`);
  }
}
