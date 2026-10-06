import type { AppSettings } from "./schema";

const FONT_STACKS: Record<AppSettings["fontFamily"], string> = {
  default: `Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
  system: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
  serif: `Georgia, "Times New Roman", Times, serif`,
  mono: `ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`,
};

/**
 * Riversa sul documento le impostazioni che sono puro CSS (tema, colori,
 * raggi, spaziature, font, sidebar, animazioni). Il CSS le legge da
 * data-attribute e variabili su :root: nessun componente deve preoccuparsi
 * di aggiungere classi o stili inline.
 */
export function applySettingsToDocument(settings: AppSettings, resolvedTheme: "dark" | "light") {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.animations = settings.animationsEnabled ? "on" : "off";
  root.dataset.sidebar = settings.sidebarPosition;

  const style = root.style;
  style.setProperty("--accent", settings.accentColor);
  style.setProperty("--study-break", settings.studyBreakColor);
  style.setProperty("--radius-card", `${settings.cardRadius}px`);
  style.setProperty("--radius-item", `${settings.itemRadius}px`);
  // Il padding orizzontale resta 2px più largo di quello verticale (come il design originale).
  style.setProperty("--widget-padding", `${settings.widgetPadding}px ${settings.widgetPadding + 2}px`);
  style.setProperty("--sidebar-width", `${settings.sidebarWidth}px`);
  style.setProperty("--font-family", FONT_STACKS[settings.fontFamily]);
}
