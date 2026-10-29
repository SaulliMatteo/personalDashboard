/**
 * Classifica l'app in primo piano (processo, descrizione dell'eseguibile e
 * titolo della finestra, letti dal comando Rust su Windows; su macOS il
 * "processo" è il bundle .app, la descrizione il nome dell'app e il titolo
 * è sempre vuoto) in poche
 * categorie, più un `appId` per le app che hanno una posa tutta loro.
 *
 * Tre livelli, dal più forte:
 *  1. la categoria scelta a mano dall'utente per quel processo;
 *  2. le app conosciute per nome (e, nei browser, il sito dal titolo);
 *  3. indizi generici: cartella del gioco (Steam, Epic, Riot…) e parole
 *     nella descrizione dell'eseguibile ("browser", "game", "editor"…).
 *
 * Il titolo serve SOLO a capire cosa c'è nel browser: non viene salvato né mostrato.
 */
export const APP_CATEGORIES = ["coding", "office", "design", "game", "chat", "video", "music", "browser", "other"] as const;
export type AppCategory = (typeof APP_CATEGORIES)[number];

/** App con una posa dedicata del Companion (vedi widgets/companion/engine/poses.ts). */
export type AppId =
  | "discord"
  | "lol"
  | "opera"
  | "spotify"
  | "youtube"
  | "streaming"
  | "live"
  | "call"
  | "messages"
  | "minecraft"
  | "shooter"
  | "excel"
  | "slides"
  | "blender"
  | "ai"
  | "explorer";

export interface ForegroundApp {
  category: AppCategory;
  appId: AppId | null;
  /** Nome leggibile del programma (mai il titolo della finestra). */
  label: string;
  /** Nome del processo senza ".exe"/".app", in minuscolo: la chiave delle scelte manuali. */
  processKey: string;
  /** Da dove viene la categoria. */
  source: "manual" | "known" | "guess" | "unknown";
}

interface Rule {
  processes: string[];
  category: AppCategory;
  label: string;
  appId?: AppId;
}

const RULES: Rule[] = [
  // Programmazione. Accanto ai processi Windows ci sono i nomi dei bundle macOS.
  { processes: ["code", "code - insiders", "cursor", "vscodium", "windsurf", "visual studio code"], category: "coding", label: "VS Code" },
  { processes: ["devenv"], category: "coding", label: "Visual Studio" },
  { processes: ["idea64", "pycharm64", "webstorm64", "rider64", "clion64", "goland64", "phpstorm64", "datagrip64", "rustrover64", "intellij idea", "pycharm", "webstorm", "rider", "clion", "goland", "rustrover"], category: "coding", label: "un IDE JetBrains" },
  { processes: ["studio64", "android studio"], category: "coding", label: "Android Studio" },
  { processes: ["sublime_text", "notepad++", "zed", "neovide", "eclipse", "sublime text", "xcode"], category: "coding", label: "l'editor" },
  { processes: ["windowsterminal", "wt", "cmd", "powershell", "pwsh", "alacritty", "wezterm-gui", "conhost", "mintty", "terminal", "iterm", "warp", "ghostty"], category: "coding", label: "il terminale" },
  { processes: ["githubdesktop", "gitkraken", "sourcetree", "postman", "insomnia", "docker desktop", "docker", "github desktop"], category: "coding", label: "gli strumenti di sviluppo" },

  // Documenti e ufficio.
  { processes: ["winword", "microsoft word", "pages"], category: "office", label: "Word" },
  { processes: ["excel", "microsoft excel", "numbers"], category: "office", label: "Excel", appId: "excel" },
  { processes: ["powerpnt", "microsoft powerpoint", "keynote"], category: "office", label: "PowerPoint", appId: "slides" },
  { processes: ["onenote", "onenoteim", "microsoft onenote"], category: "office", label: "OneNote" },
  { processes: ["obsidian"], category: "office", label: "Obsidian" },
  { processes: ["notion"], category: "office", label: "Notion" },
  { processes: ["acrord32", "acrobat", "sumatrapdf", "foxitpdfreader", "preview", "adobe acrobat reader"], category: "office", label: "il PDF" },
  { processes: ["outlook", "olk", "thunderbird", "microsoft outlook", "mail"], category: "office", label: "la posta" },
  { processes: ["notepad", "wordpad", "soffice.bin", "swriter", "textedit", "notes", "libreoffice"], category: "office", label: "i documenti" },

  // Grafica.
  { processes: ["photoshop", "illustrator", "indesign", "afterfx", "adobe premiere pro", "lightroom"], category: "design", label: "Adobe" },
  { processes: ["figma"], category: "design", label: "Figma" },
  { processes: ["gimp-2.10", "gimp", "krita", "inkscape", "paintdotnet", "clipstudiopaint", "aseprite", "mspaint", "pixelmator pro"], category: "design", label: "il disegno" },
  { processes: ["resolve", "capcut", "clipchamp", "davinci resolve", "final cut pro", "imovie"], category: "design", label: "il montaggio" },
  { processes: ["blender"], category: "design", label: "Blender", appId: "blender" },

  // Chat e chiamate.
  { processes: ["discord", "discordptb", "discordcanary"], category: "chat", label: "Discord", appId: "discord" },
  { processes: ["telegram", "whatsapp", "whatsapp.root", "signal", "messages"], category: "chat", label: "i messaggi", appId: "messages" },
  { processes: ["slack", "messenger"], category: "chat", label: "la chat" },
  { processes: ["teams", "ms-teams", "zoom", "skype", "microsoft teams", "zoom.us", "facetime"], category: "chat", label: "la videochiamata", appId: "call" },
  { processes: ["chatgpt", "claude"], category: "chat", label: "l'assistente IA", appId: "ai" },

  // Video e musica.
  { processes: ["vlc", "mpc-hc64", "mpc-hc", "mpc-be64", "potplayermini64", "potplayer", "wmplayer", "video.ui", "microsoft.media.player", "mpv", "quicktime player", "iina", "tv"], category: "video", label: "il player video" },
  { processes: ["netflix", "primevideo", "disneyplus"], category: "video", label: "un film", appId: "streaming" },
  { processes: ["obs64", "obs", "streamlabs obs", "streamlabs"], category: "video", label: "la diretta", appId: "live" },
  { processes: ["spotify"], category: "music", label: "Spotify", appId: "spotify" },
  { processes: ["music.ui", "itunes", "foobar2000", "aimp", "musicbee", "tidal", "deezer", "applemusic", "music"], category: "music", label: "la musica" },

  // Giochi (oltre a quelli trovati dalla cartella).
  { processes: ["league of legends", "leagueclient", "leagueclientux", "leagueclientuxrender"], category: "game", label: "League of Legends", appId: "lol" },
  { processes: ["valorant", "valorant-win64-shipping", "cs2", "csgo", "fortniteclient-win64-shipping", "r5apex", "overwatch", "cod", "modernwarfare", "rainbowsix", "pubg", "tslgame"], category: "game", label: "uno sparatutto", appId: "shooter" },
  { processes: ["minecraft", "minecraftlauncher", "minecraft.windows"], category: "game", label: "Minecraft", appId: "minecraft" },
  { processes: ["rocketleague", "eldenring", "gta5", "dota2", "robloxplayerbeta", "genshinimpact", "fifa", "fc24", "fc25", "witcher3", "cyberpunk2077", "hollow_knight"], category: "game", label: "un gioco" },
  { processes: ["steam", "steamwebhelper", "epicgameslauncher", "riotclientux", "riotclientservices", "battle.net", "eadesktop", "ubisoftconnect", "upc", "galaxyclient", "xboxpcapp"], category: "game", label: "il negozio di giochi" },

  // Browser e file.
  { processes: ["opera", "opera_gx", "opera gx"], category: "browser", label: "Opera", appId: "opera" },
  { processes: ["chrome", "msedge", "firefox", "brave", "vivaldi", "arc", "zen", "librewolf", "waterfox", "chromium", "safari", "google chrome", "microsoft edge", "brave browser"], category: "browser", label: "il browser" },
  { processes: ["explorer"], category: "other", label: "Esplora file", appId: "explorer" },
  { processes: ["finder"], category: "other", label: "il Finder", appId: "explorer" },
];

const BY_PROCESS = new Map<string, Rule>();
for (const rule of RULES) for (const p of rule.processes) BY_PROCESS.set(p, rule);

/** Siti riconosciuti dal titolo della scheda. L'ordine conta: "YouTube Music" è musica, non video. */
const SITE_RULES: { test: RegExp; category: AppCategory; label: string; appId?: AppId }[] = [
  { test: /youtube music|spotify|soundcloud|deezer|apple music|tidal/i, category: "music", label: "la musica nel browser" },
  { test: /twitch/i, category: "video", label: "Twitch", appId: "live" },
  { test: /youtube/i, category: "video", label: "YouTube", appId: "youtube" },
  { test: /netflix|prime video|disney\+|crunchyroll|raiplay|mediaset infinity|dazn|now tv|paramount\+|apple tv/i, category: "video", label: "un film", appId: "streaming" },
  { test: /vimeo/i, category: "video", label: "un video nel browser" },
  { test: /chatgpt|claude|gemini|copilot|perplexity/i, category: "chat", label: "l'assistente IA", appId: "ai" },
  { test: /google meet|zoom meeting|microsoft teams/i, category: "chat", label: "la videochiamata", appId: "call" },
  { test: /whatsapp|telegram/i, category: "chat", label: "i messaggi", appId: "messages" },
  { test: /discord/i, category: "chat", label: "Discord", appId: "discord" },
  { test: /fogli google|google sheets/i, category: "office", label: "i fogli di calcolo", appId: "excel" },
  { test: /presentazioni google|google slides|canva/i, category: "office", label: "le presentazioni", appId: "slides" },
  { test: /google docs|documenti google|notion|overleaf|classroom|moodle|gmail|outlook/i, category: "office", label: "i documenti" },
  { test: /figma/i, category: "design", label: "Figma" },
  { test: /github|gitlab|stack overflow|localhost/i, category: "coding", label: "il codice nel browser" },
];

/** Cartelle in cui stanno solo giochi (separatori di Windows o di macOS). */
const GAME_PATH = /[\\/]steamapps[\\/]common[\\/]|[\\/]epic games[\\/]|[\\/]riot games[\\/]|[\\/]xboxgames[\\/]|[\\/]gog galaxy[\\/]games[\\/]|[\\/]gog games[\\/]|[\\/]ubisoft game launcher[\\/]games[\\/]|[\\/]ea games[\\/]|[\\/]battle\.net[\\/]|[\\/]windowsapps[\\/].*(game|xbox)/i;

/** Parole nella descrizione dell'eseguibile (es. "Opera Internet Browser"). */
const DESCRIPTION_RULES: { test: RegExp; category: AppCategory }[] = [
  { test: /browser|navigator/i, category: "browser" },
  { test: /\bgame\b|gioco|unreal|unity player|launcher/i, category: "game" },
  { test: /music|audio player|radio/i, category: "music" },
  { test: /video|media player|player/i, category: "video" },
  { test: /chat|messenger|messag|meeting|voice/i, category: "chat" },
  { test: /code|editor|ide\b|terminal|console|shell/i, category: "coding" },
  { test: /paint|photo|draw|design|3d|render/i, category: "design" },
  { test: /office|document|word|spreadsheet|pdf|notes|mail/i, category: "office" },
];

/** "C:\\...\\Code.exe" o "Code.exe" → "code"; "/Applications/Visual Studio Code.app" → "visual studio code". */
export function processKey(processPath: string): string {
  const base = processPath.split(/[\\/]/).pop() ?? processPath;
  return base.replace(/\.(exe|app)$/i, "").trim().toLowerCase();
}

/** Nome leggibile per un'app sconosciuta: la descrizione dell'eseguibile o il nome del file. */
function fallbackLabel(key: string, description: string): string {
  const d = description.trim();
  if (d) return d.length > 32 ? `${d.slice(0, 31)}…` : d;
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "un'altra app";
}

function automatic(key: string, processPath: string, description: string, title: string): Omit<ForegroundApp, "processKey"> {
  const rule = BY_PROCESS.get(key);

  if (rule?.category === "browser") {
    const site = SITE_RULES.find((s) => s.test.test(title));
    if (site) return { category: site.category, appId: site.appId ?? null, label: site.label, source: "known" };
    return { category: "browser", appId: rule.appId ?? null, label: rule.label, source: "known" };
  }

  if (key === "spotify") {
    // Spotify mostra "Spotify"/"Spotify Premium" da fermo e "Artista - Brano" mentre suona.
    const playing = title.trim() !== "" && !/^spotify/i.test(title.trim());
    return playing ? { category: "music", appId: "spotify", label: "Spotify", source: "known" } : { category: "other", appId: null, label: "Spotify", source: "known" };
  }

  // Minecraft Java gira dentro javaw: lo si riconosce dal titolo.
  if ((key === "javaw" || key === "java") && /minecraft/i.test(title)) {
    return { category: "game", appId: "minecraft", label: "Minecraft", source: "known" };
  }

  if (rule) return { category: rule.category, appId: rule.appId ?? null, label: rule.label, source: "known" };

  if (GAME_PATH.test(processPath)) return { category: "game", appId: null, label: fallbackLabel(key, description), source: "guess" };

  const byDescription = description ? DESCRIPTION_RULES.find((r) => r.test.test(description)) : undefined;
  if (byDescription) return { category: byDescription.category, appId: null, label: fallbackLabel(key, description), source: "guess" };

  return { category: "other", appId: null, label: fallbackLabel(key, description), source: "unknown" };
}

export function classifyApp(processPath: string, description: string, title: string, manual: ReadonlyMap<string, AppCategory>): ForegroundApp {
  const key = processKey(processPath);
  const auto = automatic(key, processPath, description, title);
  const chosen = manual.get(key);
  if (chosen && chosen !== auto.category) {
    // La posa dedicata ha senso solo se l'utente non ha cambiato categoria.
    return { category: chosen, appId: null, label: auto.label, processKey: key, source: "manual" };
  }
  return { ...auto, processKey: key, source: chosen ? "manual" : auto.source };
}

// ----------------------------------------------------------------- scelte manuali

const CATEGORY_SET = new Set<string>(APP_CATEGORIES);

/** Legge l'impostazione "processo=categoria;…" ignorando voci non valide. */
export function parseAppCategories(raw: string): Map<string, AppCategory> {
  const map = new Map<string, AppCategory>();
  for (const part of raw.split(";")) {
    const [key, category] = part.split("=").map((s) => s.trim().toLowerCase());
    if (key && category && CATEGORY_SET.has(category)) map.set(key, category as AppCategory);
  }
  return map;
}

export function serializeAppCategories(map: ReadonlyMap<string, AppCategory>): string {
  return [...map]
    .filter(([key, category]) => key && !/[;=]/.test(key) && CATEGORY_SET.has(category))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, category]) => `${key}=${category}`)
    .join(";");
}
