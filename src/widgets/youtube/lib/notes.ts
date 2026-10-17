import type { VideoNote } from "../data/youtubeRepository";
import { formatTimestamp } from "./youtube";

export type NoteSort = "time" | "recent";

/** "time": nell'ordine del video; "recent": le ultime scritte per prime. */
export function sortNotes(notes: readonly VideoNote[], sort: NoteSort): VideoNote[] {
  const copy = notes.slice();
  if (sort === "recent") return copy.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
  return copy.sort((a, b) => a.timestampSeconds - b.timestampSeconds || a.id - b.id);
}

/** Prima riga = titolo della nota, il resto = corpo. */
export function splitNote(text: string): { title: string; body: string } {
  const [first = "", ...rest] = text.split("\n");
  return { title: first.trim(), body: rest.join("\n").trim() };
}

/** Appunti di un video in Markdown, nell'ordine del video: titolo, link al video, una riga per nota con il punto. */
export function notesToMarkdown(video: { title: string; youtubeId: string }, notes: readonly VideoNote[]): string {
  const lines = [`# ${video.title}`, `https://www.youtube.com/watch?v=${video.youtubeId}`, ""];
  for (const n of sortNotes(notes, "time")) {
    const link = `https://www.youtube.com/watch?v=${video.youtubeId}&t=${Math.floor(n.timestampSeconds)}s`;
    const [first, ...rest] = n.text.split("\n");
    lines.push(`- [${formatTimestamp(n.timestampSeconds)}](${link}) ${first}`);
    for (const line of rest) lines.push(line.trim() ? `  ${line}` : "");
  }
  return lines.join("\n") + "\n";
}
