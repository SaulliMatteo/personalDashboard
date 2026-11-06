/**
 * PDF.js (pdfjs-dist 4.x, senza WebAssembly: il CSP dell'app non lo ammette), caricato solo quando
 * serve un PDF. Tutto è locale: il worker, le cmaps e i font standard sono file del bundle (Vite),
 * letti dai nostri "factory" invece che da un URL fisso. Nessuna richiesta in rete: il PDF arriva
 * come bytes letti dal disco.
 *
 * Il PDF è solo da vedere: niente JavaScript del PDF (nessuna sandbox caricata, isEvalSupported
 * false), niente XFA, moduli disegnati ma non attivi, allegati incorporati ignorati.
 */

import { BaseDirectory, readFile } from "@tauri-apps/plugin-fs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { VAULT_DIR } from "../vault";

export type PdfJs = typeof import("pdfjs-dist");

/** La "carta" sotto le pagine: i PDF senza sfondo sono fogli bianchi, in ogni tema (colori originali). */
export const PDF_PAPER = "white";

let pdfjs: Promise<PdfJs> | null = null;

/** La libreria (un chunk a parte) con il suo worker, una volta sola. */
export function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= (async () => {
    const [lib, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  })();
  pdfjs.catch(() => (pdfjs = null));
  return pdfjs;
}

// File del pacchetto come asset del bundle: si scaricano (da noi stessi) solo quando un PDF li chiede.
const CMAPS = import.meta.glob("/node_modules/pdfjs-dist/cmaps/*.bcmap", { query: "?url", import: "default" }) as Record<
  string,
  () => Promise<string>
>;
const FONTS = import.meta.glob("/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}", { query: "?url", import: "default" }) as Record<
  string,
  () => Promise<string>
>;

async function bundledBytes(table: Record<string, () => Promise<string>>, key: string): Promise<Uint8Array> {
  const load = table[key];
  if (!load) throw new Error(`File di PDF.js non incluso: ${key}`);
  const url = await load();
  // I file piccoli Vite li incorpora come data: URL, che il CSP non lascia scaricare: si decodificano qui.
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const meta = url.slice(5, comma);
    const payload = url.slice(comma + 1);
    if (meta.endsWith(";base64")) return Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    return new TextEncoder().encode(decodeURIComponent(payload));
  }
  const response = await globalThis.fetch(url);
  if (!response.ok) throw new Error(`File di PDF.js non leggibile: ${key}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Cmaps (testi in cinese, giapponese, coreano…): dal bundle. */
class LocalCMapReaderFactory {
  async fetch({ name }: { name: string }) {
    return { cMapData: await bundledBytes(CMAPS, `/node_modules/pdfjs-dist/cmaps/${name}.bcmap`), isCompressed: true };
  }
}

/** Font standard (PDF che non includono i loro font): dal bundle. */
class LocalStandardFontDataFactory {
  async fetch({ filename }: { filename: string }) {
    return bundledBytes(FONTS, `/node_modules/pdfjs-dist/standard_fonts/${filename}`);
  }
}

export type PdfErrorKind = "password" | "wrongPassword" | "damaged" | "missing" | "other";

export class PdfOpenError extends Error {
  readonly kind: PdfErrorKind;
  constructor(kind: PdfErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** Messaggio per l'utente. */
export function pdfErrorMessage(kind: PdfErrorKind): string {
  switch (kind) {
    case "password":
      return "Questo PDF è protetto da password.";
    case "wrongPassword":
      return "Password sbagliata.";
    case "damaged":
      return "Impossibile leggere questo PDF: il file è danneggiato o non è un PDF.";
    case "missing":
      return "Il file PDF non si trova più nella cartella della nota.";
    default:
      return "Impossibile aprire il PDF.";
  }
}

/**
 * Apre un PDF dai suoi bytes. I bytes vengono copiati (PDF.js li passa al worker e li "consuma").
 * Errori come PdfOpenError: password richiesta o sbagliata, file danneggiato.
 */
export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const lib = await loadPdfJs();
  const task = lib.getDocument({
    data: bytes.slice(),
    password,
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: false,
    disableFontFace: false,
    useWorkerFetch: false,
    CMapReaderFactory: LocalCMapReaderFactory as never,
    StandardFontDataFactory: LocalStandardFontDataFactory as never,
    cMapPacked: true,
    // Niente richieste a pezzi: i dati ci sono già tutti.
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    stopAtErrors: false,
  });
  try {
    return await task.promise;
  } catch (error) {
    void task.destroy();
    const name = (error as { name?: string })?.name;
    const code = (error as { code?: number })?.code;
    if (name === "PasswordException") {
      throw new PdfOpenError(code === lib.PasswordResponses.INCORRECT_PASSWORD ? "wrongPassword" : "password", String(error));
    }
    if (name === "InvalidPDFException" || name === "FormatError" || name === "UnknownErrorException") throw new PdfOpenError("damaged", String(error));
    throw new PdfOpenError("other", String(error));
  }
}

/** I bytes del PDF copiato nella cartella della nota. */
export async function readNotePdf(noteDir: string | null, file: string): Promise<Uint8Array> {
  if (!noteDir) throw new PdfOpenError("missing", "Nota senza cartella su disco");
  try {
    return await readFile(`${VAULT_DIR}/${noteDir}/allegati/${file}`, { baseDir: BaseDirectory.Document });
  } catch (error) {
    throw new PdfOpenError("missing", String(error));
  }
}

// ---------------------------------------------------------------------
// Documenti aperti: restano in memoria per un po' dopo l'ultimo uso, così passando da una pagina
// della nota all'altra (o tra i due lati dello schermo diviso) il PDF non si rilegge ogni volta.
// ---------------------------------------------------------------------

interface CachedPdf {
  doc: Promise<PDFDocumentProxy>;
  refs: number;
  timer: number | null;
}

const opened = new Map<string, CachedPdf>();
const KEEP_MS = 60_000;

/**
 * Il PDF di un blocco, aperto una volta e condiviso. `release` va chiamata quando non serve più.
 * Con una password (PDF protetto) si riapre da capo; la password non viene salvata da nessuna parte.
 */
export function acquireNotePdf(noteDir: string | null, file: string, password?: string): { doc: Promise<PDFDocumentProxy>; release: () => void } {
  const key = `${noteDir ?? ""}/${file}`;
  let entry = opened.get(key);
  if (!entry || password !== undefined) {
    if (entry) void entry.doc.then((d) => d.destroy()).catch(() => undefined);
    const doc = readNotePdf(noteDir, file).then((bytes) => openPdf(bytes, password));
    entry = { doc, refs: 0, timer: null };
    opened.set(key, entry);
    const mine = entry;
    // Un errore (password, file rotto) non resta in memoria: si riprova alla prossima apertura.
    doc.catch(() => {
      if (opened.get(key) === mine) opened.delete(key);
    });
  }
  const current = entry;
  current.refs++;
  if (current.timer !== null) {
    window.clearTimeout(current.timer);
    current.timer = null;
  }
  let released = false;
  return {
    doc: current.doc,
    release: () => {
      if (released) return;
      released = true;
      current.refs--;
      if (current.refs > 0) return;
      current.timer = window.setTimeout(() => {
        if (current.refs > 0 || opened.get(key) !== current) return;
        opened.delete(key);
        void current.doc.then((d) => d.destroy()).catch(() => undefined);
      }, KEEP_MS);
    },
  };
}

/** Dimensioni (in punti) di ogni pagina, già ruotate: servono ai segnaposti. */
export async function pageSizes(doc: PDFDocumentProxy, from = 1, to = doc.numPages): Promise<[number, number][]> {
  const sizes: [number, number][] = [];
  for (let n = from; n <= to; n++) {
    const page = await doc.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    sizes.push([Math.round(width * 100) / 100, Math.round(height * 100) / 100]);
    page.cleanup();
  }
  return sizes;
}

/** Disegna una pagina su un canvas nuovo largo `widthPx` (esportazione, miniatura). */
export async function renderPageCanvas(doc: PDFDocumentProxy, pageNumber: number, widthPx: number): Promise<HTMLCanvasElement> {
  const lib = await loadPdfJs();
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: widthPx / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  await page.render({ canvasContext: ctx, viewport, annotationMode: lib.AnnotationMode.ENABLE, background: PDF_PAPER }).promise;
  page.cleanup();
  return canvas;
}
