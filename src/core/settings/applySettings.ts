import { accentFor, type AppSettings } from "./schema";
import type { ThemeMode } from "../theme/themes";

/**
 * Chiavi in localStorage con l'ultimo tema applicato: lo script inline di
 * index.html le legge per impostare data-theme e data-mode PRIMA che parta il
 * bundle, così all'avvio non compare mai il tema sbagliato. Sono solo una
 * cache: la fonte resta la tabella settings.
 */
export const THEME_CACHE_KEY = "pd-theme";
/** Variante risolta (giorno/notte). */
export const MODE_CACHE_KEY = "pd-mode";
/** Impostazione `themeMode`: con "auto" lo script ricalcola la variante dal sistema invece di fidarsi di pd-mode. */
export const THEME_MODE_CACHE_KEY = "pd-theme-mode";

/**
 * Riversa sul documento le impostazioni che sono puro CSS (tema, variante,
 * accent, sidebar, animazioni). Il CSS le legge da data-attribute e variabili
 * su :root: nessun componente deve preoccuparsi di aggiungere classi o stili
 * inline. `mode` è la variante già risolta (vedi `resolveMode`).
 */
export function applySettingsToDocument(settings: AppSettings, mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.mode = mode;
  root.dataset.animations = settings.animationsEnabled ? "on" : "off";
  root.dataset.sidebar = settings.sidebarPosition;

  const style = root.style;
  // Senza override vale l'accent definito dalla variante del tema nei token.
  const accent = accentFor(settings, mode);
  if (accent) style.setProperty("--accent", accent);
  else style.removeProperty("--accent");
  style.setProperty("--study-break", settings.studyBreakColor);

  try {
    localStorage.setItem(THEME_CACHE_KEY, settings.theme);
    localStorage.setItem(MODE_CACHE_KEY, mode);
    localStorage.setItem(THEME_MODE_CACHE_KEY, settings.themeMode);
  } catch {
    // storage non disponibile: al prossimo avvio la splash usa il tema di default
  }
}
