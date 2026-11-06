/**
 * Blocchi PDF delle note: i dati salvati in note_pages.pdf e note_pages.pdf_ink, letti e validati.
 *
 * Un blocco PDF è una pagina della nota che mostra le pagine `from`…`to` di un PDF copiato in
 * Documenti/Notes/<nota>/allegati/<file>. L'inchiostro è separato dal PDF (che resta intatto):
 * per ogni numero di pagina del PDF, tratti con coordinate normalizzate sulla larghezza della pagina,
 * come l'inchiostro delle pagine normali.
 *
 * Logica pura, niente DOM e niente PDF.js: si prova con node (scripts/notes/pdf.test.mts).
 */

import type { InkStroke } from "../../data/notesRepository";
import { asStrokes } from "../ink";
import { asBookmarkId, newBookmarkId } from "../bookmarks";

/** Limite dei PDF importati (gli altri allegati restano a 50 MB). */
export const PDF_MAX_BYTES = 200 * 1024 * 1024;

/** Lato più lungo della miniatura salvata accanto al PDF (px). */
export const PDF_THUMB_PX = 360;

export interface PdfBlockInfo {
  /** Id del blocco (per il collegamento nel testo). */
  id: string;
  /** Nome del file in allegati/. */
  file: string;
  /** Nome da mostrare (quello del file originale). */
  name: string;
  /** Intervallo di pagine del PDF mostrato, da 1. `to` = 0: non ancora letto (PDF con password). */
  from: number;
  to: number;
  /** Dimensioni in punti di ogni pagina dell'intervallo (larghezza, altezza), già ruotate. */
  sizes: [number, number][];
  /** Colori invertiti per leggere di notte. */
  invert?: boolean;
}

/** Inchiostro per numero di pagina del PDF. */
export type PdfInk = Record<string, InkStroke[]>;

const MAX_PAGES = 10000;

export function isPdfName(name: string): boolean {
  return /\.pdf$/i.test(name.trim());
}

/** Nome del file della miniatura di un PDF. */
export function pdfThumbName(file: string): string {
  return `${file}.anteprima.png`;
}

function asPageNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_PAGES ? value : null;
}

function asSize(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [w, h] = value;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 100000;
  return ok(w) && ok(h) ? [w, h] : null;
}

/** Il nome di un allegato, come lo accetta la cartella della nota (niente percorsi). */
function asFileName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > 200 || /[\\/:*?"<>|]/.test(name) || name === "." || name === "..") return null;
  return isPdfName(name) ? name : null;
}

/** Valida un blocco letto dal DB o da canvas.json; null se non è un blocco valido. */
export function asPdfInfo(value: unknown): PdfBlockInfo | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const id = asBookmarkId(v.id);
  const file = asFileName(v.file);
  const from = asPageNumber(v.from);
  const to = asPageNumber(v.to);
  if (!id || !file || from === null || to === null || from < 1 || (to !== 0 && to < from)) return null;
  const sizes = Array.isArray(v.sizes) ? v.sizes.map(asSize) : [];
  const count = to === 0 ? 0 : to - from + 1;
  // Dimensioni mancanti o rotte: si rileggono dal PDF all'apertura.
  const valid = sizes.length === count && sizes.every((s) => s !== null) ? (sizes as [number, number][]) : [];
  const name = typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 200) : file;
  return { id, file, name, from, to, sizes: valid, ...(v.invert === true ? { invert: true } : {}) };
}

export function parsePdfInfo(json: string | null | undefined): PdfBlockInfo | null {
  if (!json) return null;
  try {
    return asPdfInfo(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Inchiostro valido: solo numeri di pagina e tratti validi. */
export function asPdfInk(value: unknown): PdfInk {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: PdfInk = {};
  for (const [key, strokes] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PAGES) continue;
    const list = asStrokes(strokes);
    if (list.length > 0) out[String(n)] = list;
  }
  return out;
}

export function parsePdfInk(json: string | null | undefined): PdfInk {
  try {
    return asPdfInk(JSON.parse(json || "{}"));
  } catch {
    return {};
  }
}

/** Le pagine del PDF mostrate dal blocco, in ordine (vuoto finché non si conoscono). */
export function pdfPageNumbers(info: PdfBlockInfo): number[] {
  if (info.to === 0) return [];
  return Array.from({ length: info.to - info.from + 1 }, (_, i) => info.from + i);
}

/** Quante pagine mostra il blocco (0 = non ancora note). */
export function pdfPageCount(info: PdfBlockInfo): number {
  return info.to === 0 ? 0 : info.to - info.from + 1;
}

/** Un blocco nuovo per un PDF appena copiato. */
export function newPdfInfo(file: string, name: string, from: number, to: number, sizes: [number, number][], random?: () => number): PdfBlockInfo {
  return { id: newBookmarkId(random), file, name, from, to, sizes };
}

/** "120 pagine" / "1 pagina" / "PDF" (pagine non ancora note). */
export function pagesLabel(info: Pick<PdfBlockInfo, "from" | "to">): string {
  const n = info.to === 0 ? 0 : info.to - info.from + 1;
  return n === 0 ? "PDF" : n === 1 ? "1 pagina" : `${n} pagine`;
}

/** Link Markdown al PDF (nota.md e esportazione). `href` = dove sta il file rispetto al .md. */
export function pdfMarkdownLink(info: PdfBlockInfo, href: string): string {
  const range = info.to !== 0 && (info.from !== 1) ? `, pagine ${info.from}–${info.to}` : "";
  const label = `📄 ${info.name} (${pagesLabel(info)}${range})`.replace(/[[\]]/g, "");
  return `[${label}](<${href}>)`;
}

/** Riassunto di un blocco per elenco note e widget. */
export interface PdfSummary {
  file: string;
  name: string;
  pages: number;
}

export function pdfSummary(info: PdfBlockInfo | null): PdfSummary | null {
  return info ? { file: info.file, name: info.name, pages: pdfPageCount(info) } : null;
}
