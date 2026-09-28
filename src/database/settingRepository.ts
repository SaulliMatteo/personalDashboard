import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

export interface AppSettings {
  theme: "dark" | "light";
  glowEnabled: boolean;
  gridMargin: number;
  
}

const SETTINGS_FILE = "settings.json";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  glowEnabled: true,
  gridMargin: 10,
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