/**
 * Nome da mostrare per un'app (classifiche di Tempo al PC). `classifyApp` ha etichette fatte per le frasi di Pixy
 * ("il browser", "l'editor"): qui servono i nomi veri. Prima i nomi noti, poi la descrizione dell'eseguibile
 * ("Opera Internet Browser" → "Opera"), poi il nome del file.
 */
const KNOWN: Record<string, string> = {
  code: "VS Code",
  "code - insiders": "VS Code Insiders",
  "visual studio code": "VS Code",
  cursor: "Cursor",
  devenv: "Visual Studio",
  chrome: "Chrome",
  "google chrome": "Chrome",
  msedge: "Edge",
  "microsoft edge": "Edge",
  firefox: "Firefox",
  opera: "Opera",
  opera_gx: "Opera GX",
  "opera gx": "Opera GX",
  brave: "Brave",
  "brave browser": "Brave",
  vivaldi: "Vivaldi",
  arc: "Arc",
  zen: "Zen",
  safari: "Safari",
  explorer: "Esplora file",
  finder: "Finder",
  windowsterminal: "Terminale",
  wt: "Terminale",
  cmd: "Prompt dei comandi",
  powershell: "PowerShell",
  pwsh: "PowerShell",
  terminal: "Terminale",
  iterm: "iTerm",
  winword: "Word",
  "microsoft word": "Word",
  excel: "Excel",
  "microsoft excel": "Excel",
  powerpnt: "PowerPoint",
  "microsoft powerpoint": "PowerPoint",
  onenote: "OneNote",
  outlook: "Outlook",
  olk: "Outlook",
  notepad: "Blocco note",
  "notepad++": "Notepad++",
  acrord32: "Acrobat Reader",
  acrobat: "Acrobat",
  sumatrapdf: "SumatraPDF",
  discord: "Discord",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  "whatsapp.root": "WhatsApp",
  slack: "Slack",
  teams: "Teams",
  "ms-teams": "Teams",
  zoom: "Zoom",
  spotify: "Spotify",
  vlc: "VLC",
  steam: "Steam",
  steamwebhelper: "Steam",
  epicgameslauncher: "Epic Games",
  riotclientux: "Riot Client",
  leagueclientux: "League of Legends",
  leagueclientuxrender: "League of Legends",
  "league of legends": "League of Legends",
  minecraft: "Minecraft",
  javaw: "Java",
  obsidian: "Obsidian",
  notion: "Notion",
  figma: "Figma",
  photoshop: "Photoshop",
  blender: "Blender",
  obs64: "OBS",
  systemsettings: "Impostazioni",
  applicationframehost: "App di Windows",
  taskmgr: "Gestione attività",
  searchhost: "Cerca di Windows",
  startmenuexperiencehost: "Menu Start",
  shellexperiencehost: "Windows",
};

/** Parole che le descrizioni degli eseguibili aggiungono al nome ("Opera Internet Browser" → "Opera"). */
const DESCRIPTION_NOISE = /\s+(internet browser|web browser|browser|application|launcher|client|desktop|for windows|\(64-bit\)|x64)$/i;

export function appDisplayName(processKey: string, description: string): string {
  const known = KNOWN[processKey];
  if (known) return known;
  let d = description.trim();
  for (let i = 0; i < 3 && DESCRIPTION_NOISE.test(d); i++) d = d.replace(DESCRIPTION_NOISE, "").trim();
  if (d) return d.length > 32 ? `${d.slice(0, 31)}…` : d;
  if (!processKey) return "App sconosciuta";
  return processKey.charAt(0).toUpperCase() + processKey.slice(1);
}
