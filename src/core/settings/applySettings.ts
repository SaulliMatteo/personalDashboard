import type { AppSettings } from "./schema";

/**
 * Riversa sul documento le impostazioni che sono puro CSS (tema, accent,
 * animazioni). Il CSS le legge da data-attribute e variabili su :root:
 * nessun componente deve preoccuparsi di aggiungere classi.
 */
export function applySettingsToDocument(settings: AppSettings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.animations = settings.animationsEnabled ? "on" : "off";
  root.style.setProperty("--accent", settings.accentColor);
}
