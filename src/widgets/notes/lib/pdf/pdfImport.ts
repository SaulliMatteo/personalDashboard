/**
 * Importazione di un PDF nella nota: quante pagine ha, le loro dimensioni (per i segnaposti) e una
 * miniatura della prima pagina (elenco note e widget). Il file vero lo copia chi chiama, in allegati/.
 */

import { PDF_THUMB_PX } from "./pdfData";
import { PdfOpenError, openPdf, pageSizes, renderPageCanvas } from "./pdfDocument";

export interface PdfInspection {
  /** 0 = non si sa ancora (PDF protetto da password: si legge alla prima apertura). */
  pages: number;
  sizes: [number, number][];
  thumbnail: Uint8Array | null;
  locked: boolean;
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(async (blob) => {
      if (!blob) reject(new Error("Miniatura non creata"));
      else resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png")
  );
}

/**
 * Legge il PDF. Un PDF protetto dà `locked` (si importa lo stesso); uno danneggiato lancia
 * PdfOpenError "damaged" (chi chiama ripiega sulla scheda del file).
 */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  let doc;
  try {
    doc = await openPdf(bytes);
  } catch (error) {
    if (error instanceof PdfOpenError && (error.kind === "password" || error.kind === "wrongPassword")) {
      return { pages: 0, sizes: [], thumbnail: null, locked: true };
    }
    throw error;
  }
  try {
    const sizes = await pageSizes(doc);
    let thumbnail: Uint8Array | null = null;
    try {
      const [w, h] = sizes[0] ?? [1, 1];
      const width = w >= h ? PDF_THUMB_PX : Math.round((PDF_THUMB_PX * w) / h);
      thumbnail = await canvasPng(await renderPageCanvas(doc, 1, width));
    } catch (error) {
      console.error("Miniatura del PDF non creata:", error);
    }
    return { pages: doc.numPages, sizes, thumbnail, locked: false };
  } finally {
    void doc.destroy();
  }
}
