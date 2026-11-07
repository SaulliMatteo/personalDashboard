import { asCleanText, isRecord } from "../../../core/widgets/chatPayload";
import { parseYouTubeId } from "../lib/youtube";

/*
 * Scheda "video consigliato" nella chat degli amici: cosa viaggia e come si legge. Puro (prova
 * scripts/gruppi/chatCards.test.mts). La miniatura non viaggia: si ricava dall'id (i.ytimg.com, come nella libreria),
 * così un amico non può far caricare un indirizzo qualunque.
 */

export const VIDEO_KIND = "video";

export interface VideoCardPayload {
  youtubeId: string;
  title: string;
  channel: string;
}

export function videoPayload(video: VideoCardPayload): Record<string, unknown> {
  return { v: 1, youtubeId: video.youtubeId, title: video.title.slice(0, 200), channel: video.channel.slice(0, 100) };
}

export function parseVideoPayload(raw: unknown): VideoCardPayload | null {
  if (!isRecord(raw) || raw.v !== 1 || typeof raw.youtubeId !== "string") return null;
  // solo l'id nudo (11 caratteri): parseYouTubeId accetterebbe anche un link
  const youtubeId = /^[A-Za-z0-9_-]{11}$/.test(raw.youtubeId) ? parseYouTubeId(raw.youtubeId) : null;
  if (!youtubeId) return null;
  return { youtubeId, title: asCleanText(raw.title, 200) ?? "Video senza titolo", channel: asCleanText(raw.channel, 100) ?? "" };
}

export function thumbnailOf(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}
