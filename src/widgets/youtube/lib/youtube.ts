/**
 * Tutto ciò che riguarda YouTube e non dipende da React o dal DB:
 * estrazione dell'ID da un link, metadati (oEmbed), IFrame Player API e
 * formattazione dei timestamp.
 */

// ---------------------------------------------------------------------
// Link -> ID
// ---------------------------------------------------------------------

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Accetta link youtube.com/watch, youtu.be, shorts, embed, live, music.youtube.com oppure il solo ID. Null se non riconosciuto. */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (ID_PATTERN.test(text)) return text;

  let url: URL;
  try {
    url = new URL(text.includes("://") ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www|m)\./, "");
  let candidate: string | null = null;

  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v");
    } else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?]+)/);
      candidate = match ? match[1] : null;
    }
  }

  return candidate !== null && ID_PATTERN.test(candidate) ? candidate : null;
}

// ---------------------------------------------------------------------
// Metadati (oEmbed)
// ---------------------------------------------------------------------

export interface VideoMetadata {
  title: string;
  channel: string;
  thumbnailUrl: string | null;
}

/**
 * Titolo, canale e miniatura di un video. Lancia un Error con un messaggio
 * già pronto da mostrare. Un errore HTTP qui di solito significa video
 * privato, rimosso o con l'incorporamento disattivato: meglio scoprirlo ora
 * che al primo avvio del player.
 */
export async function fetchVideoMetadata(youtubeId: string): Promise<VideoMetadata> {
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

  let response: Response;
  try {
    response = await fetch(endpoint);
  } catch {
    throw new Error("Impossibile contattare YouTube: controlla la connessione.");
  }
  if (!response.ok) {
    throw new Error("Video non disponibile o non incorporabile (privato, rimosso o con l'incorporamento disattivato).");
  }

  const data = (await response.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
  return {
    title: data.title?.trim() || "Video senza titolo",
    channel: data.author_name?.trim() ?? "",
    thumbnailUrl: data.thumbnail_url ?? null,
  };
}

// ---------------------------------------------------------------------
// IFrame Player API
// ---------------------------------------------------------------------

export interface YTPlayerInstance {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
}

interface YTPlayerEvents {
  onReady: () => void;
  onError: (e: { data: number }) => void;
  onStateChange: (e: { data: number }) => void;
  onPlaybackRateChange?: (e: { data: number }) => void;
}

interface YTNamespace {
  Player: new (iframe: HTMLIFrameElement, options: { events: YTPlayerEvents }) => YTPlayerInstance;
}

// Cast locale invece di `declare global`: niente conflitti se un altro file dichiara gli stessi campi.
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

let apiPromise: Promise<YTNamespace> | null = null;

/** Carica lo script dell'API una volta sola e restituisce il namespace `YT`. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  const w = window as YTWindow;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (w.YT) resolve(w.YT);
      else reject(new Error("API di YouTube non disponibile."));
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      apiPromise = null; // permette un nuovo tentativo
      reject(new Error("Impossibile caricare il player di YouTube: controlla la connessione."));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

/** Messaggio leggibile per i codici d'errore del player (documentati nell'IFrame API). */
export function describePlayerError(code: number | string): string {
  switch (code) {
    case 2:
      return "ID del video non valido.";
    case 5:
      return "Il player non riesce a riprodurre questo video.";
    case 100:
      return "Video non trovato (rimosso o privato).";
    case 101:
    case 150:
      return "Il proprietario non permette di riprodurre questo video fuori da YouTube.";
    case 153:
      return "YouTube ha rifiutato il player (errore 153: la pagina non ha inviato il referrer).";
    default:
      return typeof code === "string" ? code : `Errore del player (codice ${code}).`;
  }
}

// ---------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------

/** Secondi -> "m:ss" oppure "h:mm:ss". */
/** Velocità offerte nel menu, nell'ordine in cui YouTube le elenca (0.25–2); la rete di sicurezza se il player non risponde. */
export const DEFAULT_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function formatRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate : String(rate)}x`;
}

export function formatTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}
