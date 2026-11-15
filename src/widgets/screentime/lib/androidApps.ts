import { classifyApp, type AppCategory } from "../../../core/system/appCategory";
import { appDisplayName } from "./appName";
import { BROWSER_KEYS, SELF_KEY, SELF_LABEL, type ClassifiedSegment } from "./classify";
import type { PhoneEvents, PhonePackage, PhoneSegment } from "./androidEvents";

/**
 * Le app del telefono come righe di Tempo allo schermo. Un'app che c'è anche sul PC prende la sua chiave (`app_key`)
 * del PC, così nella vista "Tutti" è una riga sola (Discord sul PC e sul telefono). Le altre tengono il nome del
 * pacchetto come chiave e il nome che dà Android.
 */

interface KnownPackage {
  /** Chiave della riga: quella del processo sul PC, dove c'è. */
  key: string;
  /** Solo per le app che sul PC non ci sono (sul PC la decide classifyApp). */
  category?: AppCategory;
  label?: string;
}

const KNOWN_PACKAGES: Record<string, KnownPackage> = {
  // Anche sul PC: stessa chiave del processo (core/system/appCategory.ts, lib/appName.ts).
  "com.discord": { key: "discord" },
  "com.whatsapp": { key: "whatsapp" },
  "com.whatsapp.w4b": { key: "whatsapp" },
  "org.telegram.messenger": { key: "telegram" },
  "org.telegram.messenger.web": { key: "telegram" },
  "org.thoughtcrime.securesms": { key: "signal" },
  "com.Slack": { key: "slack" },
  "com.microsoft.teams": { key: "teams" },
  "us.zoom.videomeetings": { key: "zoom" },
  // Spotify sul PC è "musica" solo mentre suona (dal titolo): sul telefono il titolo non c'è.
  "com.spotify.music": { key: "spotify", category: "music" },
  "com.netflix.mediaclient": { key: "netflix" },
  "org.videolan.vlc": { key: "vlc" },
  "com.openai.chatgpt": { key: "chatgpt" },
  "com.anthropic.claude": { key: "claude" },
  "com.notion.id": { key: "notion" },
  "md.obsidian": { key: "obsidian" },
  "com.figma.mirror": { key: "figma" },
  "com.microsoft.office.word": { key: "winword" },
  "com.microsoft.office.excel": { key: "excel" },
  "com.microsoft.office.powerpoint": { key: "powerpnt" },
  "com.microsoft.office.onenote": { key: "onenote" },
  "com.microsoft.office.outlook": { key: "outlook" },
  "com.mojang.minecraftpe": { key: "minecraft" },
  "com.valvesoftware.android.steam.community": { key: "steam" },
  "com.android.chrome": { key: "chrome" },
  "com.microsoft.emmx": { key: "msedge" },
  "org.mozilla.firefox": { key: "firefox" },
  "com.opera.browser": { key: "opera" },
  "com.opera.gx": { key: "opera_gx" },
  "com.brave.browser": { key: "brave" },
  "com.vivaldi.browser": { key: "vivaldi" },
  // Solo sul telefono, ma molto comuni: categoria giusta anche quando Android non la dichiara.
  "com.google.android.youtube": { key: "youtube", category: "video", label: "YouTube" },
  "com.google.android.apps.youtube.music": { key: "youtube_music", category: "music", label: "YouTube Music" },
  "com.instagram.android": { key: "instagram", category: "social", label: "Instagram" },
  "com.instagram.barcelona": { key: "threads", category: "social", label: "Threads" },
  "com.zhiliaoapp.musically": { key: "tiktok", category: "social", label: "TikTok" },
  "com.ss.android.ugc.trill": { key: "tiktok", category: "social", label: "TikTok" },
  "com.facebook.katana": { key: "facebook", category: "social", label: "Facebook" },
  "com.facebook.orca": { key: "messenger", label: "Messenger" },
  "com.twitter.android": { key: "x", category: "social", label: "X" },
  "com.reddit.frontpage": { key: "reddit", category: "social", label: "Reddit" },
  "com.snapchat.android": { key: "snapchat", category: "social", label: "Snapchat" },
  "com.pinterest": { key: "pinterest", category: "social", label: "Pinterest" },
  "tv.twitch.android.app": { key: "twitch", category: "video", label: "Twitch" },
  "com.amazon.avod.thirdpartyclient": { key: "primevideo" },
  "com.disney.disneyplus": { key: "disneyplus" },
  "com.google.android.gm": { key: "gmail", category: "office", label: "Gmail" },
  "com.google.android.apps.docs.editors.docs": { key: "google_docs", category: "office", label: "Documenti Google" },
  "com.google.android.apps.docs": { key: "google_drive", category: "office", label: "Drive" },
};

/** `ApplicationInfo.category` di Android (GAME = 0 … PRODUCTIVITY = 7) → categoria di Tempo allo schermo. */
const ANDROID_CATEGORY: Record<number, AppCategory> = {
  0: "game",
  1: "music",
  2: "video",
  3: "design",
  4: "social",
  7: "office",
};

const NO_CHOICES: ReadonlyMap<string, AppCategory> = new Map();

/** La schermata Home non è un'app usata: come "via dal PC", non conta. */
export const HOME_KEY = "__home";

/** "com.example.notes" → "Notes": quando Android non dice il nome (app disinstallata). */
function nameFromPackage(pkg: string): string {
  const last = pkg.split(".").filter(Boolean).pop() ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** Chiave, nome e categoria automatica di un pacchetto. */
export function classifyPackage(info: PhonePackage): { appKey: string; appLabel: string; category: AppCategory } {
  const known = KNOWN_PACKAGES[info.pkg];
  const androidLabel = info.label?.trim() || nameFromPackage(info.pkg);
  if (known) {
    const appLabel = known.label ?? appDisplayName(known.key, androidLabel);
    const category = BROWSER_KEYS.has(known.key) ? "browser" : (known.category ?? classifyApp(known.key, androidLabel, "", NO_CHOICES).category);
    return { appKey: known.key, appLabel, category };
  }
  // Prima quello che dichiara l'app, poi le regole del PC sul nome ("Telegram X", "Steam Link"…).
  const declared = ANDROID_CATEGORY[info.category];
  const guess = classifyApp(androidLabel.toLowerCase(), androidLabel, "", NO_CHOICES).category;
  return { appKey: info.pkg, appLabel: androidLabel, category: declared ?? guess };
}

/** Tratti del telefono → segmenti pronti da contare, come quelli del PC (lib/classify.ts). */
export function classifyPhoneSegments(segments: PhoneSegment[], batch: Pick<PhoneEvents, "packages" | "home" | "self">): ClassifiedSegment[] {
  const byPkg = new Map(batch.packages.map((p) => [p.pkg, p]));
  const home = new Set(batch.home);
  return segments.map((seg) => {
    const base = { startMs: seg.startMs, endMs: seg.endMs };
    if (seg.pkg === batch.self) return { ...base, appKey: SELF_KEY, appLabel: SELF_LABEL, category: "other", counted: true };
    if (home.has(seg.pkg)) return { ...base, appKey: HOME_KEY, appLabel: "Home", category: "other", counted: false };
    const app = classifyPackage(byPkg.get(seg.pkg) ?? { pkg: seg.pkg, category: -1 });
    return { ...base, ...app, counted: true };
  });
}
