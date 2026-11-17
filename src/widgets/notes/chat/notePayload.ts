import { asBatchId, asCleanText, CHAT_FILES_MAX_BYTES, isRecord } from "../../../core/widgets/chatPayload";
import type { InkStroke, NewPageInput, NotePage, PageBackground } from "../data/notesRepository";
import { asAttachmentName } from "../lib/imageEdit";
import { asStrokes } from "../lib/ink";
import { asPageColor } from "../lib/pageColor";
import { asPdfInfo, asPdfInk } from "../lib/pdf/pdfData";
import { asTitleColor } from "../lib/titleColor";

/*
 * Scheda "nota" nella chat degli amici: una copia completa della nota (titolo, colore del titolo, pagine con testo,
 * tabelle, scrittura a mano, pagine PDF) e i suoi file (immagini, allegati, PDF), che viaggiano a parte nel bucket
 * degli amici (core/cloud/friendFilesApi.ts) in un lotto. Non viaggiano segni e viste delle raccolte (rimandano a cose
 * di chi la manda). Puro: l'HTML lo ripulisce `cleanHtml` (sanitizeHtml con source "esterno" e i soli file del lotto,
 * nell'app), sia prima di mandarlo sia a ogni lettura, perché arriva da un'altra persona. Prova:
 * scripts/gruppi/chatCards.test.mts.
 *
 * v 1: senza file (anche le app di prima la leggono). v 2: con `files: { batch, list: [{ name, size }] }`; un'app di
 * prima mostra la scheda di ripiego invece di una nota con le pagine PDF vuote.
 */

export const NOTE_KIND = "note";
/** Il server accetta fino a 512 KB di payload: si resta sotto con un po' di margine (vale per il JSON, non i file). */
export const NOTE_PAYLOAD_MAX_BYTES = 500_000;
export const NOTE_PAGES_MAX = 50;
/** File per nota (il server ne tiene al massimo 200 per mittente nel bucket). */
export const NOTE_FILES_MAX = 100;

/** Un file della nota: nome nella cartella allegati/ e dimensione in byte. */
export interface NoteFile {
  name: string;
  size: number;
}

export interface NoteFiles {
  batch: string;
  list: NoteFile[];
}

export interface NoteCardPayload {
  title: string;
  titleColor: string | null;
  pages: NewPageInput[];
  /** null = nota senza file (o arrivata da un'app di prima). */
  files: NoteFiles | null;
}

/** Ripulisce l'HTML di una pagina; `files` sono i nomi dei file che arrivano con la nota. */
export type CleanHtml = (html: string, files: ReadonlySet<string>) => string;

const BACKGROUNDS: readonly PageBackground[] = ["none", "dots", "grid", "lines"];
const asBackground = (v: unknown): PageBackground => (BACKGROUNDS.includes(v as PageBackground) ? (v as PageBackground) : "none");

function asNoteFiles(raw: unknown): NoteFiles | null {
  if (!isRecord(raw) || !Array.isArray(raw.list)) return null;
  const batch = asBatchId(raw.batch);
  if (!batch) return null;
  const seen = new Set<string>();
  const list: NoteFile[] = [];
  let total = 0;
  for (const f of raw.list.slice(0, NOTE_FILES_MAX)) {
    if (!isRecord(f)) continue;
    const name = asAttachmentName(typeof f.name === "string" ? f.name : null);
    const size = typeof f.size === "number" && Number.isInteger(f.size) && f.size >= 0 ? f.size : null;
    if (!name || size === null || seen.has(name) || total + size > CHAT_FILES_MAX_BYTES) continue;
    seen.add(name);
    total += size;
    list.push({ name, size });
  }
  return list.length > 0 ? { batch, list } : null;
}

function cleanPage(raw: unknown, files: ReadonlySet<string>, cleanHtml: CleanHtml): NewPageInput | null {
  if (!isRecord(raw)) return null;
  const pdf = raw.pdf === undefined || raw.pdf === null ? null : asPdfInfo(raw.pdf);
  // una pagina PDF senza il suo file non si mostra: resta fuori
  if (raw.pdf !== undefined && raw.pdf !== null && (!pdf || !files.has(pdf.file))) return null;
  const content = typeof raw.content === "string" ? cleanHtml(raw.content, files) : "";
  const ink: InkStroke[] = asStrokes(raw.ink);
  const page: NewPageInput = { content: content || "<p><br></p>", ink, background: asBackground(raw.background), color: asPageColor(raw.color) };
  return pdf ? { ...page, pdf, pdfInk: asPdfInk(raw.pdfInk) } : page;
}

export function parseNotePayload(raw: unknown, cleanHtml: CleanHtml): NoteCardPayload | null {
  if (!isRecord(raw) || (raw.v !== 1 && raw.v !== 2) || !Array.isArray(raw.pages)) return null;
  const files = raw.v === 2 ? asNoteFiles(raw.files) : null;
  const names = new Set(files?.list.map((f) => f.name) ?? []);
  const pages = raw.pages
    .slice(0, NOTE_PAGES_MAX)
    .map((p) => cleanPage(p, names, cleanHtml))
    .filter((p): p is NewPageInput => p !== null);
  if (pages.length === 0) return null;
  return { title: asCleanText(raw.title, 200) ?? "Nota senza titolo", titleColor: asTitleColor(raw.titleColor), pages, files };
}

export class NoteTooBigError extends Error {
  constructor() {
    super("Nota troppo grande da mandare (al massimo 500 KB): togli un po' di scrittura a mano o dividila in più note.");
  }
}

export class NoteFilesTooBigError extends Error {
  constructor() {
    super(`Nota con più di ${CHAT_FILES_MAX_BYTES / 1024 / 1024} MB di file (PDF, immagini e allegati): non si può mandare.`);
  }
}

/** I nomi dei file di cui ha bisogno una nota: allegati (immagini comprese) e il file di ogni pagina PDF. */
export function noteFileNames(pages: readonly NotePage[], attachments: readonly string[]): string[] {
  const names = new Set<string>();
  for (const a of attachments) {
    const name = asAttachmentName(a);
    if (name) names.add(name);
  }
  for (const p of pages.slice(0, NOTE_PAGES_MAX)) if (p.pdf) names.add(p.pdf.file);
  return [...names];
}

/**
 * Il payload di una nota da mandare. `files` sono i file letti dalla cartella della nota (quelli che mancano su disco
 * non ci sono: le loro pagine PDF restano fuori). Lancia NoteTooBigError o NoteFilesTooBigError oltre i limiti.
 */
export function buildNotePayload(
  title: string,
  titleColor: string | null,
  pages: readonly NotePage[],
  cleanHtml: CleanHtml,
  files: NoteFiles | null = null
): Record<string, unknown> {
  const list = files?.list.slice(0, NOTE_FILES_MAX) ?? [];
  if (list.reduce((n, f) => n + f.size, 0) > CHAT_FILES_MAX_BYTES) throw new NoteFilesTooBigError();
  const names = new Set(list.map((f) => f.name));
  const kept = pages.filter((p) => p.pdf === null || names.has(p.pdf.file)).slice(0, NOTE_PAGES_MAX);
  const payload: Record<string, unknown> = {
    v: list.length > 0 ? 2 : 1,
    title: title.slice(0, 200),
    titleColor,
    pages: kept.map((p) => ({
      content: cleanHtml(p.content, names),
      ink: p.ink,
      background: p.background,
      color: p.color,
      ...(p.pdf ? { pdf: p.pdf, pdfInk: p.pdfInk } : {}),
    })),
  };
  if (files && list.length > 0) payload.files = { batch: files.batch, list };
  if (kept.length === 0) throw new Error("Questa nota non ha pagine da mandare: i suoi PDF non sono sul disco.");
  if (new TextEncoder().encode(JSON.stringify(payload)).length > NOTE_PAYLOAD_MAX_BYTES) throw new NoteTooBigError();
  return payload;
}
