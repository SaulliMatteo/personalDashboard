import type { AppSettings } from "./schema";

/**
 * Chiave in localStorage con l'ultimo tema applicato: lo script inline di
 * index.html la legge per impostare data-theme PRIMA che parta il bundle,
 * così all'avvio non compare mai il tema sbagliato. È solo una cache: la
 * fonte resta la tabella settings.
 */
export const THEME_CACHE_KEY = "pd-theme";

/**
 * Riversa sul documento le impostazioni che sono puro CSS (tema, accent,
 * sidebar, animazioni). Il CSS le legge da data-attribute e variabili su
 * :root: nessun componente deve preoccuparsi di aggiungere classi o stili inline.
 */
export function applySettingsToDocument(settings: AppSettings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.animations = settings.animationsEnabled ? "on" : "off";
  root.dataset.sidebar = settings.sidebarPosition;

  const style = root.style;
  // Senza override vale l'accent definito dal tema in tokens.css.
  if (settings.accentOverride) style.setProperty("--accent", settings.accentColor);
  else style.removeProperty("--accent");
  style.setProperty("--study-break", settings.studyBreakColor);

  try {
    localStorage.setItem(THEME_CACHE_KEY, settings.theme);
  } catch {
    // storage non disponibile: al prossimo avvio la splash usa il tema di default
  }
}
