import type { AppCategory } from "../../../core/system/appCategory";

/** Nomi delle categorie in Tempo allo schermo (etichette delle righe, limiti, Focus o svago). */
export const CATEGORY_LABEL: Record<AppCategory, string> = {
  coding: "Codice",
  office: "Documenti",
  design: "Grafica",
  game: "Giochi",
  chat: "Chat",
  social: "Social",
  video: "Video",
  music: "Musica",
  browser: "Browser",
  other: "Altro",
};

/** Esempi sotto ogni categoria nella scheda "Focus o svago". */
export const CATEGORY_HINT: Record<AppCategory, string> = {
  coding: "VS Code, terminale, IntelliJ",
  office: "Word, PDF, posta, Notion",
  design: "Figma, Photoshop, Blender",
  game: "Steam, Riot, Epic e i giochi",
  chat: "Discord, WhatsApp, Teams",
  social: "app di Instagram, TikTok, Telegram",
  video: "VLC, Netflix, app di Twitch",
  music: "Spotify, Apple Music",
  browser: "Opera, Chrome, Edge, Firefox",
  other: "Esplora file, impostazioni…",
};
