/**
 * Classifica l'app in primo piano (nome del processo + titolo della
 * finestra, letti dal comando Rust su Windows) in poche categorie.
 * Il titolo serve SOLO a capire se nel browser c'è un video/musica:
 * non viene salvato né mostrato da nessuna parte.
 */
export type AppCategory = "video" | "music" | "coding" | "office" | "chat" | "design" | "game" | "browser" | "other";

export interface ForegroundApp {
  category: AppCategory;
  /** Nome leggibile del programma (mai il titolo della finestra). */
  label: string;
}

interface Rule {
  processes: string[];
  category: AppCategory;
  label: string;
}

const RULES: Rule[] = [
  { processes: ["code", "code - insiders", "cursor"], category: "coding", label: "VS Code" },
  { processes: ["devenv"], category: "coding", label: "Visual Studio" },
  { processes: ["idea64", "pycharm64", "webstorm64", "rider64", "clion64", "goland64", "phpstorm64", "studio64"], category: "coding", label: "un IDE JetBrains" },
  { processes: ["sublime_text", "notepad++", "zed"], category: "coding", label: "l'editor" },
  { processes: ["windowsterminal", "wt", "cmd", "powershell", "pwsh", "alacritty", "wezterm-gui"], category: "coding", label: "il terminale" },

  { processes: ["vlc", "mpc-hc64", "mpc-hc", "mpc-be64", "potplayermini64", "potplayer", "wmplayer", "video.ui", "microsoft.media.player", "mpv"], category: "video", label: "il player video" },
  { processes: ["spotify"], category: "music", label: "Spotify" },
  { processes: ["music.ui", "itunes", "foobar2000", "aimp", "musicbee"], category: "music", label: "la musica" },

  { processes: ["winword"], category: "office", label: "Word" },
  { processes: ["excel"], category: "office", label: "Excel" },
  { processes: ["powerpnt"], category: "office", label: "PowerPoint" },
  { processes: ["onenote", "obsidian", "notion", "acrord32", "acrobat", "sumatrapdf"], category: "office", label: "gli appunti" },

  { processes: ["discord", "teams", "ms-teams", "slack", "telegram", "whatsapp", "signal", "zoom"], category: "chat", label: "la chat" },

  { processes: ["photoshop", "illustrator", "figma", "blender", "gimp", "krita", "afterfx", "adobe premiere pro", "resolve"], category: "design", label: "la grafica" },

  { processes: ["league of legends", "valorant", "valorant-win64-shipping", "cs2", "fortnite", "fortniteclient-win64-shipping", "rocketleague", "eldenring", "gta5", "minecraft", "overwatch", "r5apex", "dota2"], category: "game", label: "un gioco" },

  { processes: ["chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "arc"], category: "browser", label: "il browser" },
];

const BY_PROCESS = new Map<string, Rule>();
for (const rule of RULES) for (const p of rule.processes) BY_PROCESS.set(p, rule);

const VIDEO_TITLE = /youtube|netflix|twitch|prime video|disney\+|vimeo|crunchyroll|raiplay|mediaset infinity|dazn|now tv/i;
const MUSIC_TITLE = /spotify|soundcloud|youtube music|deezer|apple music/i;
const OFFICE_TITLE = /google docs|documenti google|fogli google|google sheets|notion|overleaf|classroom|moodle/i;

/** "C:\\...\\Code.exe" o "Code.exe" → "code". */
export function processKey(processPath: string): string {
  const base = processPath.split(/[\\/]/).pop() ?? processPath;
  return base.replace(/\.exe$/i, "").trim().toLowerCase();
}

export function classifyApp(processPath: string, title: string): ForegroundApp {
  const key = processKey(processPath);
  const rule = BY_PROCESS.get(key);

  if (rule?.category === "browser") {
    // L'ordine conta: "YouTube Music" è musica, non video.
    if (MUSIC_TITLE.test(title)) return { category: "music", label: "la musica nel browser" };
    if (VIDEO_TITLE.test(title)) return { category: "video", label: "un video nel browser" };
    if (OFFICE_TITLE.test(title)) return { category: "office", label: "i documenti" };
    return { category: "browser", label: rule.label };
  }

  if (key === "spotify") {
    // Spotify mostra "Spotify"/"Spotify Premium" da fermo e "Artista - Brano" mentre suona.
    const playing = title.trim() !== "" && !/^spotify/i.test(title.trim());
    return { category: playing ? "music" : "other", label: "Spotify" };
  }

  if (rule) return { category: rule.category, label: rule.label };
  return { category: "other", label: "un'altra app" };
}
