import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:dashboard.db").catch((error) => {
      dbPromise = null; // permette un nuovo tentativo dopo un errore
      throw error;
    });
  }
  return dbPromise;
}
