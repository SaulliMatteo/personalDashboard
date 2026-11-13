import type { AppCategory } from "../../../core/system/appCategory";

/** Nomi delle categorie in Tempo al PC (etichette delle righe, limiti, Focus o svago). */
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
  coding: "VS Code, terminale, GitHub",
  office: "Word, PDF, posta, Notion",
  design: "Figma, Photoshop, Blender",
  game: "Steam, Riot, Epic e i giochi",
  chat: "Discord, WhatsApp, ChatGPT",
  social: "Instagram, TikTok, Reddit, X",
  video: "YouTube, Netflix, Twitch",
  music: "Spotify, musica nel browser",
  browser: "siti non riconosciuti",
  other: "Esplora file, impostazioni…",
};
