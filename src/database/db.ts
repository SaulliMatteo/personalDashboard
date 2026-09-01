import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function getDatabase() {
  if (!db) {
    console.log("Apertura database...");

    db = await Database.load("sqlite:dashboard.db");

    console.log("Database aperto:", db);
  }

  return db;
}

export async function initializeDatabase() {
  const database = await getDatabase();

  await database.execute(`
  CREATE TABLE IF NOT EXISTS dashboard_layout (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    widget_id TEXT NOT NULL UNIQUE,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    w INTEGER NOT NULL,
    h INTEGER NOT NULL
  )
`);

  console.log("Tabella creata");

}

