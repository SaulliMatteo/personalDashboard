/*
 * Prove dei blocchi PDF del Quaderno (src/widgets/notes/lib/pdf/pdfData.ts): validazione dei dati
 * salvati (note_pages.pdf e pdf_ink, canvas.json), pagine dell'intervallo, link Markdown.
 * Funzioni pure, niente PDF.js. Lancio (da questa cartella del repo):
 *   npx rolldown scripts/notes/pdf.test.mts --file node_modules/.tmp/notes-pdf.test.mjs --platform node
 *   node node_modules/.tmp/notes-pdf.test.mjs
 */
import assert from "node:assert/strict";
import {
  asPdfInfo,
  asPdfInk,
  isPdfName,
  newPdfInfo,
  pagesLabel,
  parsePdfInfo,
  parsePdfInk,
  pdfMarkdownLink,
  pdfPageCount,
  pdfPageNumbers,
  pdfSummary,
  pdfThumbName,
} from "../../src/widgets/notes/lib/pdf/pdfData";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error(`FALLITO: ${name}`);
    throw error;
  }
}

const ok = { id: "abcd1234", file: "dispensa.pdf", name: "Dispensa.pdf", from: 1, to: 3, sizes: [[595, 842], [595, 842], [842, 595]] };

test("un blocco valido resta com'è", () => {
  assert.deepEqual(asPdfInfo(ok), ok);
  assert.deepEqual(parsePdfInfo(JSON.stringify({ ...ok, invert: true })), { ...ok, invert: true });
});

test("rifiuta file con percorsi, non PDF, id e intervalli sbagliati", () => {
  assert.equal(asPdfInfo({ ...ok, file: "../segreto.pdf" }), null);
  assert.equal(asPdfInfo({ ...ok, file: "C:\\\\x.pdf" }), null);
  assert.equal(asPdfInfo({ ...ok, file: "documento.exe" }), null);
  assert.equal(asPdfInfo({ ...ok, id: "x" }), null);
  assert.equal(asPdfInfo({ ...ok, from: 0 }), null);
  assert.equal(asPdfInfo({ ...ok, from: 5, to: 2 }), null);
  assert.equal(asPdfInfo(null), null);
  assert.equal(parsePdfInfo("non json"), null);
  assert.equal(parsePdfInfo(null), null);
});

test("dimensioni rotte o in numero sbagliato: si rileggono all'apertura (vuote)", () => {
  assert.deepEqual(asPdfInfo({ ...ok, sizes: [[595, 842]] })?.sizes, []);
  assert.deepEqual(asPdfInfo({ ...ok, sizes: [[595, -1], [1, 1], [1, 1]] })?.sizes, []);
});

test("PDF con password: pagine non ancora note", () => {
  const locked = newPdfInfo("p.pdf", "P.pdf", 1, 0, [], () => 0.5);
  assert.equal(locked.id, "ssssssss");
  assert.deepEqual(asPdfInfo(locked), locked);
  assert.deepEqual(pdfPageNumbers(locked), []);
  assert.equal(pdfPageCount(locked), 0);
  assert.equal(pagesLabel(locked), "PDF");
});

test("pagine dell'intervallo ed etichette", () => {
  assert.deepEqual(pdfPageNumbers({ ...ok, from: 4, to: 6 }), [4, 5, 6]);
  assert.equal(pagesLabel(ok), "3 pagine");
  assert.equal(pagesLabel({ from: 2, to: 2 }), "1 pagina");
});

test("inchiostro: solo numeri di pagina e tratti validi", () => {
  const stroke = { tool: "pen", color: "#112233", size: 2, points: [[0.1, 0.2], [0.3, 0.4]] };
  const ink = asPdfInk({ "1": [stroke], "0": [stroke], abc: [stroke], "2": [{ ...stroke, color: "red" }], "3": [] });
  assert.deepEqual(Object.keys(ink), ["1"]);
  assert.deepEqual(parsePdfInk("[1,2]"), {});
  assert.deepEqual(parsePdfInk(null), {});
});

test("Markdown e miniatura", () => {
  assert.equal(pdfMarkdownLink(ok, "allegati/dispensa.pdf"), "[📄 Dispensa.pdf (3 pagine)](<allegati/dispensa.pdf>)");
  assert.equal(pdfMarkdownLink({ ...ok, name: "a [b]", from: 2, to: 3 }, "x.pdf"), "[📄 a b (2 pagine, pagine 2–3)](<x.pdf>)");
  assert.equal(pdfThumbName("dispensa.pdf"), "dispensa.pdf.anteprima.png");
  assert.ok(isPdfName("Libro.PDF") && !isPdfName("libro.pdf.txt"));
  assert.deepEqual(pdfSummary(asPdfInfo(ok)), { file: "dispensa.pdf", name: "Dispensa.pdf", pages: 3 });
  assert.equal(pdfSummary(null), null);
});

console.log(`pdf: ${passed} prove superate`);
