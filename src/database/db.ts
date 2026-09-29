import Database from "@tauri-apps/plugin-sql";
import { loadSettings, saveSettings } from "./settingRepository";

// Bump quando una modifica allo schema/alle unità del layout rende i dati
// salvati precedenti non più validi (es. cambio del numero di colonne
// della griglia). Vedi initializeDatabase() più sotto.
const CURRENT_LAYOUT_SCHEMA_VERSION = 1;

// Cache della PROMISE di apertura, non solo del valore risolto: se due
// chiamanti invocano getDatabase() prima che il primo Database.load()
// sia risolto (es. l'effect di App.tsx e quello del layout, che partono
// nello stesso giro di render), con solo "let db" entrambi vedrebbero
// db === null e aprirebbero due connessioni separate. Cachare la promise
// fa sì che il secondo chiamante aspetti la STESSA apertura del primo.
let dbPromise: Promise<Database> | null = null;

export async function getDatabase() {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:dashboard.db");
  }
  return dbPromise;
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

  // Migrazione una tantum: la griglia è passata da 12 a 4 colonne, quindi
  // qualunque x/y/w/h salvato in precedenza descrive posizioni che non
  // hanno più senso (potrebbero uscire dalla griglia o sovrapporsi).
  // Confrontiamo la versione salvata nei settings con quella corrente e,
  // se è più vecchia, svuotiamo la tabella una sola volta: al riavvio
  // successivo la Dashboard ripartirà dal DEFAULT_LAYOUT (4 colonne).
  const settings = await loadSettings();
  if (settings.layoutSchemaVersion < CURRENT_LAYOUT_SCHEMA_VERSION) {
    await database.execute(`DELETE FROM dashboard_layout`);
    await saveSettings({ ...settings, layoutSchemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION });
  }
}

