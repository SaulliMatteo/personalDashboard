import { asCleanText, isRecord } from "../../../core/widgets/chatPayload";
import type { InkStroke, NewPageInput, NotePage, PageBackground } from "../data/notesRepository";
import { asStrokes } from "../lib/ink";
import { asPageColor } from "../lib/pageColor";
import { asTitleColor } from "../lib/titleColor";

/*
 * Scheda "nota" nella chat degli amici: una copia della nota (titolo, colore del titolo e pagine con testo,
 * tabelle e scrittura a mano). Non viaggiano PDF, allegati e immagini (sono file), né segni e viste delle raccolte
 * (rimandano a cose di chi la manda). Puro: l'HTML lo ripulisce `cleanHtml` (sanitizeHtml con source "esterno"
 * nell'app), sia prima di mandarlo sia a ogni lettura, perché arriva da un'altra persona. Prova:
 * scripts/gruppi/chatCards.test.mts.
 */

export const NOTE_KIND = "note";
/** Il server accetta fino a 512 KB di payload: si resta sotto con un po' di margine. */
export const NOTE_PAYLOAD_MAX_BYTES = 500_000;
export const NOTE_PAGES_MAX = 50;

export interface NoteCardPayload {
  title: string;
  titleColor: string | null;
  pages: NewPageInput[];
}

export type CleanHtml = (html: string) => string;

const BACKGROUNDS: readonly PageBackground[] = ["none", "dots", "grid", "lines"];
const asBackground = (v: unknown): PageBackground => (BACKGROUNDS.includes(v as PageBackground) ? (v as PageBackground) : "none");

function cleanPage(raw: unknown, cleanHtml: CleanHtml): NewPageInput | null {
  if (!isRecord(raw)) return null;
  const content = typeof raw.content === "string" ? cleanHtml(raw.content) : "";
  const ink: InkStroke[] = asStrokes(raw.ink);
  return { content: content || "<p><br></p>", ink, background: asBackground(raw.background), color: asPageColor(raw.color) };
}

export function parseNotePayload(raw: unknown, cleanHtml: CleanHtml): NoteCardPayload | null {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.pages)) return null;
  const pages = raw.pages
    .slice(0, NOTE_PAGES_MAX)
    .map((p) => cleanPage(p, cleanHtml))
    .filter((p): p is NewPageInput => p !== null);
  if (pages.length === 0) return null;
  return { title: asCleanText(raw.title, 200) ?? "Nota senza titolo", titleColor: asTitleColor(raw.titleColor), pages };
}

export class NoteTooBigError extends Error {
  constructor() {
    super("Nota troppo grande da mandare (al massimo 500 KB): togli un po' di scrittura a mano o dividila in più note.");
  }
}

export interface BuiltNote {
  payload: Record<string, unknown>;
  /** Pagine con un PDF, rimaste fuori. */
  skippedPdf: number;
}

/** Il payload di una nota da mandare. Lancia NoteTooBigError se supera il limite. */
export function buildNotePayload(title: string, titleColor: string | null, pages: readonly NotePage[], cleanHtml: CleanHtml): BuiltNote {
  const kept = pages.filter((p) => p.pdf === null).slice(0, NOTE_PAGES_MAX);
  const payload = {
    v: 1,
    title: title.slice(0, 200),
    titleColor,
    pages: kept.map((p) => ({ content: cleanHtml(p.content), ink: p.ink, background: p.background, color: p.color })),
  };
  if (new TextEncoder().encode(JSON.stringify(payload)).length > NOTE_PAYLOAD_MAX_BYTES) throw new NoteTooBigError();
  return { payload, skippedPdf: pages.length - kept.length };
}
