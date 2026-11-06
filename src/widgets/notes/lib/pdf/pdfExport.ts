/**
 * Esportazione dei blocchi PDF.
 * - Immagini (PNG/JPG e ripiego): ogni pagina del PDF disegnata da PDF.js con l'inchiostro sopra.
 * - PDF (pdf-lib, caricata solo qui): le pagine ORIGINALI copiate così come sono (testo selezionabile)
 *   con l'inchiostro disegnato sopra come tracciati. L'originale non si tocca: si lavora su una copia
 *   in memoria.
 */

import type { PDFDocument, PDFPage } from "pdf-lib";
import type { InkStroke, NotePage } from "../../data/notesRepository";
import { REF_WIDTH, THEME_INK, drawStrokes } from "../ink";
import { pdfPageNumbers, type PdfBlockInfo } from "./pdfData";
import { acquireNotePdf, loadPdfJs, readNotePdf, renderPageCanvas } from "./pdfDocument";

/** Inchiostro "del tema" sulla carta bianca del PDF: scuro. */
const DARK_INK = "#1a1a1e";

const onPaper = (color: string) => (color.toLowerCase() === THEME_INK ? DARK_INK : color);

/**
 * Le pagine di un blocco come canvas larghi `widthPx`, con l'inchiostro. Un PDF che non si apre
 * (password, file mancante) restituisce un elenco vuoto: chi chiama lo segnala.
 */
export async function renderPdfBlockCanvases(page: NotePage, noteDir: string | null, widthPx: number): Promise<HTMLCanvasElement[]> {
  const info = page.pdf;
  if (!info) return [];
  const handle = acquireNotePdf(noteDir, info.file);
  try {
    const doc = await handle.doc;
    const out: HTMLCanvasElement[] = [];
    for (const n of pdfPageNumbers(info)) {
      const canvas = await renderPageCanvas(doc, n, widthPx);
      const ctx = canvas.getContext("2d");
      const strokes = page.pdfInk[String(n)];
      if (ctx && strokes?.length) drawStrokes(ctx, canvas.width, strokes, onPaper);
      out.push(canvas);
    }
    return out;
  } catch (error) {
    console.error(`PDF «${info.name}» non esportato:`, error);
    return [];
  } finally {
    handle.release();
  }
}

/** "#rrggbb" → componenti 0..1. */
function rgbOf(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** Il blocco PDF aggiunto a `out` (pdf-lib): pagine originali + inchiostro. Restituisce le pagine aggiunte. */
export async function appendPdfBlock(out: PDFDocument, page: NotePage, noteDir: string | null): Promise<PDFPage[]> {
  const info = page.pdf as PdfBlockInfo;
  const lib = await import("pdf-lib");
  const bytes = await readNotePdf(noteDir, info.file);
  // Un PDF cifrato non si copia: chi chiama ripiega sulle immagini (o lo segnala).
  const source = await lib.PDFDocument.load(bytes, { updateMetadata: false });
  const numbers = pdfPageNumbers(info).filter((n) => n <= source.getPageCount());
  const copied = await out.copyPages(
    source,
    numbers.map((n) => n - 1)
  );

  // Le coordinate dell'inchiostro sono quelle della pagina come si vede (ruotata): PDF.js le riporta
  // nello spazio del PDF (rotazione e origine comprese).
  const added: PDFPage[] = [];
  const pdfjsHandle = acquireNotePdf(noteDir, info.file);
  try {
    const doc = await pdfjsHandle.doc;
    await loadPdfJs();
    for (let i = 0; i < copied.length; i++) {
      const target = out.addPage(copied[i]);
      added.push(target);
      const strokes: InkStroke[] = page.pdfInk[String(numbers[i])] ?? [];
      if (strokes.length === 0) continue;
      const viewport = (await doc.getPage(numbers[i])).getViewport({ scale: 1 });
      for (const s of strokes) {
        if (s.points.length === 0) continue;
        const pts = s.points.map(([x, y]) => viewport.convertToPdfPoint(x * viewport.width, y * viewport.width) as [number, number]);
        if (pts.length === 1) pts.push([pts[0][0] + 0.01, pts[0][1]]);
        // drawSvgPath capovolge l'asse y (come l'SVG): si passano le y con il segno cambiato.
        const d = pts.map(([px, py], j) => `${j === 0 ? "M" : "L"}${px.toFixed(2)} ${(-py).toFixed(2)}`).join(" ");
        const [r, g, b] = rgbOf(onPaper(s.color));
        target.drawSvgPath(d, {
          x: 0,
          y: 0,
          scale: 1,
          borderColor: lib.rgb(r, g, b),
          borderWidth: s.size * (s.tool === "highlighter" ? 5 : 1) * (viewport.width / REF_WIDTH),
          borderOpacity: s.tool === "highlighter" ? 0.35 : 1,
          borderLineCap: lib.LineCapStyle.Round,
        });
      }
    }
  } finally {
    pdfjsHandle.release();
  }
  return added;
}
