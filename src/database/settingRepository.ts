import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

export interface AppSettings {
  theme: "dark" | "light";
  glowEnabled: boolean;
  gridMargin: number;
  /**
   * Versione dello schema del layout salvato. Usata da
   * src/database/db.ts per capire se la tabella dashboard_layout va
   * azzerata una volta sola (es. dopo il passaggio da 12 a 4 colonne,
   * che rende invalidi i vecchi valori x/y/w/h). Non è un dettaglio di
   * "aspetto" come le altre impostazioni, ma vive qui per riusare lo
   * stesso file di persistenza già presente invece di introdurne un altro.
   */
  layoutSchemaVersion: number;
}

const SETTINGS_FILE = "settings.json";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  glowEnabled: true,
  gridMargin: 10,
  layoutSchemaVersion: 0,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const fileExists = await exists(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
    if (!fileExists) return DEFAULT_SETTINGS;

    const content = await readTextFile(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
  } catch (error) {
    console.error("Errore nel caricamento delle impostazioni:", error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await writeTextFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
  } catch (error) {
    console.error("Errore nel salvataggio delle impostazioni:", error);
  }
}