import type { AppCategory } from "../../../core/system/appCategory";

/**
 * Il sito di una scheda del browser, ricavato dal titolo della finestra (es. "Video divertente - YouTube - Google
 * Chrome" → YouTube). Solo il nome del sito esce di qui: il titolo non si salva da nessuna parte.
 *
 * 1. via il nome del browser in fondo (e il profilo di Edge, "e altre 3 schede", i contatori "(3) ");
 * 2. i pezzi del titolo (separati da " - ", " | ", " — ", " · ") dal fondo all'inizio: il primo che è un sito noto;
 * 3. altrimenti l'ultimo pezzo, se sembra un nome (corto, poche parole) o un dominio;
 * 4. altrimenti "Altro sul web".
 * Su macOS il titolo è vuoto (servirebbe il permesso di registrare lo schermo): lì il sito resta sconosciuto.
 */
export const OTHER_SITE = "Altro sul web";

export interface SiteMatch {
  site: string;
  /** Categoria del sito noto; null = decide la classificazione dell'app (di solito "browser"). */
  category: AppCategory | null;
}

interface KnownSite {
  test: RegExp;
  name: string;
  category: AppCategory;
}

/** L'ordine conta: "YouTube Music" prima di "YouTube", "Google Meet" prima dei servizi Google generici. */
const KNOWN_SITES: KnownSite[] = [
  { test: /^youtube music$/i, name: "YouTube Music", category: "music" },
  { test: /^youtube$/i, name: "YouTube", category: "video" },
  { test: /^twitch$/i, name: "Twitch", category: "video" },
  { test: /^netflix$/i, name: "Netflix", category: "video" },
  { test: /^(amazon )?prime video$/i, name: "Prime Video", category: "video" },
  { test: /^disney\+$/i, name: "Disney+", category: "video" },
  { test: /^crunchyroll$/i, name: "Crunchyroll", category: "video" },
  { test: /^raiplay$/i, name: "RaiPlay", category: "video" },
  { test: /^mediaset infinity$/i, name: "Mediaset Infinity", category: "video" },
  { test: /^dazn$/i, name: "DAZN", category: "video" },
  { test: /^vimeo$/i, name: "Vimeo", category: "video" },
  { test: /^instagram$/i, name: "Instagram", category: "social" },
  { test: /^tiktok$/i, name: "TikTok", category: "social" },
  { test: /^reddit$|^r\/\w+$/i, name: "Reddit", category: "social" },
  { test: /^facebook$/i, name: "Facebook", category: "social" },
  { test: /^x$|^twitter$/i, name: "X", category: "social" },
  { test: /^linkedin$/i, name: "LinkedIn", category: "social" },
  { test: /^pinterest$/i, name: "Pinterest", category: "social" },
  { test: /^bluesky$/i, name: "Bluesky", category: "social" },
  { test: /^whatsapp$/i, name: "WhatsApp", category: "chat" },
  { test: /^telegram( web)?$/i, name: "Telegram", category: "chat" },
  { test: /^discord$/i, name: "Discord", category: "chat" },
  { test: /^google meet$|^meet$/i, name: "Google Meet", category: "chat" },
  { test: /^chatgpt$/i, name: "ChatGPT", category: "chat" },
  { test: /^claude$/i, name: "Claude", category: "chat" },
  { test: /^gemini$/i, name: "Gemini", category: "chat" },
  { test: /^(microsoft )?copilot$/i, name: "Copilot", category: "chat" },
  { test: /^perplexity$/i, name: "Perplexity", category: "chat" },
  { test: /^gmail$/i, name: "Gmail", category: "office" },
  { test: /^outlook$/i, name: "Outlook", category: "office" },
  { test: /^(google docs|documenti google)$/i, name: "Google Docs", category: "office" },
  { test: /^(google sheets|fogli google)$/i, name: "Fogli Google", category: "office" },
  { test: /^(google slides|presentazioni google)$/i, name: "Presentazioni Google", category: "office" },
  { test: /^google drive$|^drive$/i, name: "Google Drive", category: "office" },
  { test: /^google classroom$|^classroom$/i, name: "Classroom", category: "office" },
  { test: /^moodle$/i, name: "Moodle", category: "office" },
  { test: /^notion$/i, name: "Notion", category: "office" },
  { test: /^overleaf/i, name: "Overleaf", category: "office" },
  { test: /^canva$/i, name: "Canva", category: "design" },
  { test: /^figma$/i, name: "Figma", category: "design" },
  { test: /^github$/i, name: "GitHub", category: "coding" },
  { test: /^gitlab$/i, name: "GitLab", category: "coding" },
  { test: /^stack overflow$/i, name: "Stack Overflow", category: "coding" },
  { test: /^(mdn web docs|mdn)$/i, name: "MDN", category: "coding" },
  { test: /^wikipedia$/i, name: "Wikipedia", category: "office" },
  { test: /^amazon(\.it|\.com)?$/i, name: "Amazon", category: "other" },
  { test: /^spotify/i, name: "Spotify", category: "music" },
  { test: /^soundcloud$/i, name: "SoundCloud", category: "music" },
];

/** Nomi dei browser come compaiono in fondo al titolo (Edge ha uno spazio di larghezza zero in "Microsoft Edge"). */
const BROWSER_SUFFIX =
  /\s*[-–—]\s*(google chrome|chromium|mozilla firefox|firefox|microsoft[\s\u200b]*edge|opera( gx)?|brave|vivaldi|waterfox|librewolf|zen browser|arc|safari)\s*$/i;

const SEPARATORS = /\s+[-–—|·•]\s+/;

/** Pagine vuote del browser: non dicono nulla di dove sei. */
const BLANK = /^(nuova scheda|new tab|scheda nuova|pagina iniziale|start page|speed dial|untitled|senza titolo)$/i;

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

export function cleanBrowserTitle(title: string, processKey: string): string {
  let t = title.replace(/\s+/g, " ").trim();
  const hadSuffix = BROWSER_SUFFIX.test(t);
  t = t.replace(BROWSER_SUFFIX, "");
  // Edge con più profili: "Pagina - Profilo 1 - Microsoft Edge" → l'ultimo pezzo è il profilo.
  if (hadSuffix && /msedge|microsoft edge/.test(processKey)) {
    const parts = t.split(SEPARATORS);
    if (parts.length >= 2 && /^(personale|personal|lavoro|work|profilo( \d+)?|profile( \d+)?)$/i.test(parts[parts.length - 1])) {
      parts.pop();
      t = parts.join(" - ");
    }
  }
  t = t.replace(/\s+(e altre|and) \d+ (pagine|schede|pages|tabs)$/i, "");
  t = t.replace(/^\(\d+\+?\)\s*/, "");
  return t.trim();
}

function known(piece: string): KnownSite | undefined {
  const p = piece.trim();
  return KNOWN_SITES.find((s) => s.test.test(p));
}

export function siteFromTitle(title: string, processKey: string): SiteMatch {
  const cleaned = cleanBrowserTitle(title, processKey);
  if (!cleaned || BLANK.test(cleaned)) return { site: OTHER_SITE, category: null };

  // X (Twitter): "Nome su X: \"testo\" / X"
  if (/\s\/\s*x$/i.test(cleaned)) return { site: "X", category: "social" };

  const pieces = cleaned.split(SEPARATORS).filter(Boolean);
  for (let i = pieces.length - 1; i >= 0; i--) {
    const hit = known(pieces[i]);
    if (hit) return { site: hit.name, category: hit.category };
  }
  // Titolo fatto solo dal nome del sito con un prefisso (es. "Inbox (3) - nome@gmail.com - Gmail" è già coperto;
  // "WhatsApp" da solo pure). Qualche sito mette il nome all'inizio: "Reddit - Dive into anything".
  const first = pieces[0];
  const head = first ? known(first.split(":")[0]) : undefined;
  if (head) return { site: head.name, category: head.category };

  if (pieces.length >= 2) {
    const last = pieces[pieces.length - 1].trim();
    const words = last.split(/\s+/).length;
    if (DOMAIN.test(last)) return { site: last.toLowerCase().replace(/^www\./, ""), category: null };
    if (last.length <= 24 && words <= 3 && !/^\d+$/.test(last)) return { site: last, category: null };
  } else if (DOMAIN.test(cleaned)) {
    return { site: cleaned.toLowerCase().replace(/^www\./, ""), category: null };
  }
  return { site: OTHER_SITE, category: null };
}
