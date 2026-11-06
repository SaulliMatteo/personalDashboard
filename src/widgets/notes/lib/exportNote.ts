import { join } from "@tauri-apps/api/path";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { exists, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { PDFDocument, PDFPage } from "pdf-lib";
import type { NotePage } from "../data/notesRepository";
import { htmlToMarkdown, monthYear, sanitizeHtml } from "./html";
import { isPageColorKey, luminance, paperVars } from "./pageColor";
import type { NoteFont } from "./textStyle";
import { renderStaticBlocks } from "./blockExport";
import { layoutTables } from "./tableDom";
import { expandCollectionBlocks } from "./viewExport";
import { THEME_INK, drawStrokes } from "./ink"; // al posto del solo drawStrokes
import { CONTRAST_LARGE, asTitleColor } from "./titleColor";
import { readableOn } from "./useTitleColor";
import { MARKER_SELECTOR, kindGlyph, pinsMarkdown, readBookmarks, readMarker, type TextMark } from "./bookmarks";
import { pdfMarkdownLink, pdfPageCount } from "./pdf/pdfData";
import { readNotePdf } from "./pdf/pdfDocument";
import { appendPdfBlock, renderPdfBlockCanvases } from "./pdf/pdfExport";

export interface ExportMeta {
  title: string;
  /** "LAVORO / PROGETTO ATLANTE" */
  kicker: string;
  createdAt: number;
  /** Font predefinito della nota. */
  font?: NoteFont | null;
  /** Cartella della nota su disco: da lì si leggono le immagini dei blocchi. */
  noteDir?: string | null;
  /** Colore del titolo scelto dall'utente (null = quello del tema). */
  titleColor?: string | null;
  /** Pagine della nota (per la riga sotto il titolo). */
  pageCount?: number;
}

export interface RenderOptions {
  /** Fattore di risoluzione (3 = tre volte i pixel dello schermo). */
  scale: number;
  /** Sfondo chiaro anche se l'app è in tema scuro (adatto alla stampa). */
  light: boolean;
  /** I segni si vedono sulle pagine (nel PDF diventano comunque i segnalibri del documento). */
  marks?: boolean;
}

/** Un segno nella pagina esportata: titolo e altezza (frazione dell'altezza della pagina). */
interface ExportMark {
  title: string;
  ratio: number;
}

interface RenderedPage {
  canvas: HTMLCanvasElement;
  marks: ExportMark[];
}

/** Il titolo del segno nei segnalibri del PDF: il nome, con il simbolo del tipo davanti (tranne il segnalibro). */
function markTitle(b: Pick<TextMark, "name" | "kind">): string {
  return b.kind === "bookmark" ? b.name : `${kindGlyph(b.kind)} ${b.name}`;
}

/** Il colore del segno sulla pagina esportata (token del tema, colore libero o accento). */
function markColor(style: CSSStyleDeclaration, color: string | null, accent: string): string {
  if (!color) return accent;
  if (color.startsWith("#")) return color;
  return style.getPropertyValue(`--nq-ink-${color}`).trim() || accent;
}

const PAPER_WIDTH = 870; // = 58em a 15px, la larghezza del foglio nell'editor
const LIGHT_VARS: Record<string, string> = {
  "--bg-card": "#ffffff",
  "--note-page-bg": "#ffffff",
  "--note-page-ink": "#1a1a1e",
  "--note-page-pattern": "none",
  "--note-page-border": "0",
  "--note-page-shadow": "none",
  "--text-primary": "#1a1a1e",
  "--text-secondary": "#3a3a42",
  "--text-muted": "#6e6e78",
  "--border-subtle": "rgba(0, 0, 0, 0.08)",
  "--surface-1": "rgba(0, 0, 0, 0.04)",
  "--surface-2": "rgba(0, 0, 0, 0.07)",
  "--on-accent": "#ffffff",
};

// ---------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------

/**
 * Markdown della nota. Con un colore del titolo il file comincia con un frontmatter YAML
 * (`titleColor: "#rrggbb"`, tra virgolette perché in YAML # apre un commento), come nota.md.
 */
export function noteToMarkdown(
  title: string,
  pages: NotePage[],
  titleColor: string | null = null,
  pdfHref: (file: string) => string = (file) => file
): string {
  // Le viste collegate diventano tabelle con i dati del momento (lib/viewExport.ts); i segni sulla pagina,
  // commenti; i blocchi PDF, un link al file (salvato accanto al .md).
  const body = pages
    .map((p) => {
      if (p.pdf) return pdfMarkdownLink(p.pdf, pdfHref(p.pdf.file));
      const text = htmlToMarkdown(expandCollectionBlocks(p.content, { refsAsText: true }), { pdfHref });
      const pins = pinsMarkdown(p.pins);
      return pins ? `${text}\n\n${pins}` : text;
    })
    .join("\n\n---\n\n");
  const color = asTitleColor(titleColor);
  const front = color ? `---\ntitleColor: ${JSON.stringify(color)}\n---\n\n` : "";
  return `${front}# ${title || "Senza titolo"}\n\n${body}\n`;
}

// ---------------------------------------------------------------------
// Pagina → canvas
// ---------------------------------------------------------------------

// function luminance(hex: string): number {
//   const m = hex.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
//   if (!m) return 0;
//   const v = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
//   const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
//   return 0.2126 * r + 0.7152 * g + 0.0722 * b;
// }

/** Tratti quasi bianchi (invisibili su carta bianca) diventano quasi neri. */
const lightInk = (color: string) => (luminance(color) > 0.85 ? "#1a1a1e" : color);

function buildStage(page: NotePage, number: number, meta: ExportMeta, light: boolean, minHeight: number) {
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-20000px;top:0;pointer-events:none;";
  if (light) {
    for (const [key, value] of Object.entries(LIGHT_VARS)) stage.style.setProperty(key, value);
    // Le pagine della palette (crema, salvia…) prendono i colori del giorno (tokens.css).
    stage.classList.add("nq-export-light");
  }

  const paper = document.createElement("div");
  paper.className = "nq-paper";
  paper.dataset.bg = page.background;
  // Prima le misure (cssText sostituisce tutto lo stile), poi il colore della pagina.
  paper.style.cssText = `--nq-zoom:1;--nq-paper-w:${PAPER_WIDTH}px;width:${PAPER_WIDTH}px;max-width:none;flex:none;border:none;border-radius:0;box-shadow:none;min-height:${minHeight}px;`;
  if (isPageColorKey(page.color)) {
    paper.dataset.pageColor = page.color;
  } else if (page.color) {
    paper.style.backgroundColor = page.color;
    for (const [key, value] of Object.entries(paperVars(page.color))) paper.style.setProperty(key, value);
  }
  if (meta.font) paper.dataset.noteFont = meta.font;
  paper.innerHTML =
    `<div class="nq-paper-head"><span></span><span></span></div>` +
    `<div class="nq-doc"></div>` +
    `<div class="nq-paper-foot"><span></span><span></span></div>`;

  const [headLeft, headRight] = Array.from(paper.querySelectorAll(".nq-paper-head span"));
  const [footLeft, footRight] = Array.from(paper.querySelectorAll(".nq-paper-foot span"));
  headLeft.textContent = meta.kicker;
  headRight.textContent = monthYear(meta.createdAt).toUpperCase();
  footLeft.textContent = `${meta.kicker} · ${(meta.title || "Senza titolo").toUpperCase()}`;
  footRight.textContent = String(number).padStart(2, "0");

  // Prima pagina: titolo e riga sotto, come nell'editor (anche l'inchiostro resta allineato al testo).
  let titleEl: HTMLElement | null = null;
  if (number === 1) {
    const block = document.createElement("div");
    block.className = "nq-page-titleblock";
    titleEl = document.createElement("div");
    titleEl.className = "nq-page-title";
    titleEl.textContent = meta.title || "Senza titolo";
    const props = document.createElement("div");
    props.className = "nq-props";
    const created = new Date(meta.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
    const count = meta.pageCount ?? 1;
    props.textContent = `Creata ${created} · ${count === 1 ? "1 pagina" : `${count} pagine`}`;
    block.append(titleEl, props);
    paper.querySelector(".nq-paper-head")?.after(block);
  }

  const doc = paper.querySelector<HTMLElement>(".nq-doc");
  if (doc) {
    doc.innerHTML = sanitizeHtml(expandCollectionBlocks(page.content));
    layoutTables(doc); // larghezze delle colonne
  }

  stage.appendChild(paper);
  document.body.appendChild(stage);

  // Il colore del titolo, leggibile sulla pagina esportata (chiara o del tema).
  const readable = titleEl ? readableOn(titleEl, asTitleColor(meta.titleColor), CONTRAST_LARGE) : null;
  if (titleEl && readable) titleEl.style.color = readable.color;

  // I "cerchietti" delle checklist sono ::before, che la clonazione degli
  // stili non porta con sé: si sostituiscono con elementi veri.
  const accent = getComputedStyle(stage).getPropertyValue("--accent").trim() || "#6c8dff";
  paper.querySelectorAll<HTMLElement>(".nq-doc [data-check]").forEach((el) => {
    const checked = el.getAttribute("data-check") === "1";
    const box = document.createElement("span");
    box.textContent = checked ? "✓" : "";
    box.style.cssText =
      `position:absolute;left:0;top:0.3em;display:flex;align-items:center;justify-content:center;` +
      `box-sizing:border-box;width:1.05em;height:1.05em;border:1.5px solid ${accent};border-radius:50%;` +
      `font-size:0.8em;line-height:1;color:#fff;background:${checked ? accent : "transparent"};`;
    el.prepend(box);
  });

  return { stage, paper };
}

/** Copia l'elemento scrivendo in ogni nodo gli stili calcolati: l'SVG che ne esce non dipende dal CSS dell'app. */
function cloneWithStyles(source: Element): Element {
  const clone = source.cloneNode(false) as Element;
  const computed = getComputedStyle(source);
  let css = "";
  for (let i = 0; i < computed.length; i++) css += `${computed[i]}:${computed.getPropertyValue(computed[i])};`;
  clone.setAttribute("style", css);
  for (const child of Array.from(source.childNodes)) {
    clone.appendChild(child.nodeType === Node.ELEMENT_NODE ? cloneWithStyles(child as Element) : child.cloneNode(true));
  }
  return clone;
}

/**
 * Segni della pagina esportata: con "mostra" quelli nel testo diventano pastiglie vere (lo ::before del
 * CSS non passa nella copia degli stili), altrimenti spariscono. Restituisce dove stanno, per il PDF.
 */
function exportMarks(paper: HTMLElement, page: NotePage, show: boolean): ExportMark[] {
  const style = getComputedStyle(paper);
  const accent = style.getPropertyValue("--accent").trim() || "#6c8dff";
  const markers = Array.from(paper.querySelectorAll<HTMLElement>(`.nq-doc ${MARKER_SELECTOR}`));
  if (show) {
    for (const el of markers) {
      const data = readMarker(el);
      if (!data) continue;
      el.textContent = data.kind === "bookmark" ? "▾" : kindGlyph(data.kind);
      el.style.cssText =
        `display:inline-block;margin:0 0.15em;padding:0 0.35em;border-radius:0.5em;font-size:0.72em;line-height:1.45;` +
        `font-weight:700;vertical-align:0.12em;color:#fff;background:${markColor(style, data.color, accent)};`;
    }
  }
  const height = paper.getBoundingClientRect().height || 1;
  const top = paper.getBoundingClientRect().top;
  const byId = new Map(markers.map((el) => [el.dataset.bm, el]));
  const out: ExportMark[] = [];
  for (const b of readBookmarks(page.content, page.pins)) {
    if (b.place === "testo") {
      const el = byId.get(b.id);
      if (el) out.push({ title: markTitle(b), ratio: Math.max(0, (el.getBoundingClientRect().top - top) / height) });
    } else {
      const pin = page.pins.find((p) => p.id === b.id);
      if (pin) out.push({ title: markTitle(b), ratio: Math.max(0, (pin.y * PAPER_WIDTH) / height) });
    }
  }
  if (!show) markers.forEach((el) => el.remove());
  return out;
}

/** Segni sulla pagina, disegnati sopra l'inchiostro (solo con "mostra i segni"). */
function drawPins(ctx: CanvasRenderingContext2D, width: number, page: NotePage, style: CSSStyleDeclaration) {
  const accent = style.getPropertyValue("--accent").trim() || "#6c8dff";
  for (const pin of page.pins) {
    const x = pin.x * width;
    const y = pin.y * width;
    ctx.save();
    ctx.fillStyle = markColor(style, pin.color, accent);
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pin.kind === "bookmark" ? "▾" : kindGlyph(pin.kind), x, y + 0.5);
    ctx.restore();
  }
}

async function renderPage(
  page: NotePage,
  number: number,
  meta: ExportMeta,
  { scale, light, marks = false }: RenderOptions
): Promise<RenderedPage> {
  // L'altezza deve contenere anche i tratti disegnati in basso.
  const lowestStroke = page.ink.reduce((max, s) => s.points.reduce((m, [, y]) => Math.max(m, y), max), 0);
  const minHeight = Math.ceil(Math.max(840, lowestStroke * PAPER_WIDTH + 32));

  const { stage, paper } = buildStage(page, number, meta, light, minHeight);
  try {
    // Immagini e schede file come HTML statico (prima di misurare l'altezza).
    await renderStaticBlocks(paper, meta.noteDir ?? null);
    const found = exportMarks(paper, page, marks);
    const width = PAPER_WIDTH;
    const height = Math.ceil(paper.getBoundingClientRect().height);
    const background = getComputedStyle(paper).backgroundColor;
    const xhtml = new XMLSerializer().serializeToString(cloneWithStyles(paper));
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;

    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non disponibile");
    ctx.scale(scale, scale);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    // Su una pagina colorata l'inchiostro del tema è quello della pagina (scuro o chiaro a seconda del colore).
    const pageInk = getComputedStyle(paper).getPropertyValue("--note-page-ink").trim() || THEME_INK;
    const mapInk = page.color
      ? (c: string) => (c.toLowerCase() === THEME_INK ? pageInk : c)
      : light
        ? lightInk
        : undefined;
    drawStrokes(ctx, width, page.ink, mapInk);
    if (marks) drawPins(ctx, width, page, getComputedStyle(paper));
    return { canvas, marks: found };
  } finally {
    stage.remove();
  }
}

/** Scala massima che tiene l'altezza sotto il limite dei canvas dei browser. */
function safeScale(wanted: number, pageCount: number): number {
  const approxHeight = Math.max(1, pageCount) * 900;
  return Math.max(1, Math.min(wanted, 14000 / approxHeight));
}

/** Pagine "come immagini" dell'esportazione: un blocco PDF ne dà una per ogni sua pagina. */
function imagePageCount(pages: NotePage[]): number {
  return pages.reduce((n, p) => n + (p.pdf ? Math.max(1, pdfPageCount(p.pdf)) : 1), 0);
}

async function renderAll(pages: NotePage[], meta: ExportMeta, options: RenderOptions): Promise<RenderedPage[]> {
  const opts = { ...options, scale: safeScale(options.scale, imagePageCount(pages)) };
  const canvases: RenderedPage[] = [];
  const withCount = { ...meta, pageCount: pages.length };
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (page.pdf) {
      // Le pagine del PDF, disegnate con il loro inchiostro (un PDF che non si apre non esce).
      for (const canvas of await renderPdfBlockCanvases(page, meta.noteDir ?? null, Math.round(PAPER_WIDTH * opts.scale))) {
        canvases.push({ canvas, marks: [] });
      }
    } else {
      canvases.push(await renderPage(page, i + 1, withCount, opts));
    }
  }
  if (canvases.length === 0) throw new Error("Niente da esportare");
  return canvases;
}

function toBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Impossibile creare l'immagine"))), type, quality)
  );
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------
// Immagine (tutte le pagine una sotto l'altra)
// ---------------------------------------------------------------------

/** Altezza massima dell'immagine esportata (px). */
const IMAGE_MAX_HEIGHT = 32000;

/** La nota è troppo lunga per una sola immagine (es. un PDF di molte pagine): meglio il PDF. */
export class ExportTooTallError extends Error {
  constructor() {
    super("Troppe pagine per una sola immagine");
  }
}

export async function renderNoteImage(
  pages: NotePage[],
  meta: ExportMeta,
  format: "png" | "jpeg",
  options: RenderOptions
): Promise<Uint8Array> {
  const canvases = (await renderAll(pages, meta, options)).map((r) => r.canvas);
  const gap = Math.round(24 * canvases[0].width / PAPER_WIDTH);
  const total = canvases.reduce((sum, c) => sum + c.height, 0) + gap * (canvases.length - 1);
  // Un'immagine sola non può essere infinita (i browser rifiutano i canvas troppo alti).
  if (total > IMAGE_MAX_HEIGHT) throw new ExportTooTallError();

  const sheet = document.createElement("canvas");
  sheet.width = canvases[0].width;
  sheet.height = total;
  const ctx = sheet.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.fillStyle = options.light ? "#e9e9ee" : "#0b0b0e";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  let y = 0;
  for (const c of canvases) {
    ctx.drawImage(c, 0, y);
    y += c.height + gap;
  }
  return blobBytes(await toBlob(sheet, format === "png" ? "image/png" : "image/jpeg"));
}

// ---------------------------------------------------------------------
// PDF (una pagina di nota = una pagina PDF, con l'immagine ad alta risoluzione)
// ---------------------------------------------------------------------

export async function renderNotePdf(pages: NotePage[], meta: ExportMeta, options: RenderOptions): Promise<Uint8Array> {
  if (pages.some((p) => p.pdf)) return renderNotePdfWithBlocks(pages, meta, options);
  const rendered = await renderAll(pages, meta, options);
  const jpegs = [];
  for (const { canvas: c } of rendered) jpegs.push({ data: await blobBytes(await toBlob(c, "image/jpeg", 0.92)), w: c.width, h: c.height });
  return buildPdf(jpegs, rendered.map((r) => r.marks));
}

/** Una pagina di testo della nota come immagine JPEG nel PDF di pdf-lib (larga come un A4). */
async function addImagePage(out: PDFDocument, canvas: HTMLCanvasElement): Promise<PDFPage> {
  const jpg = await out.embedJpg(await blobBytes(await toBlob(canvas, "image/jpeg", 0.92)));
  const width = 595.28;
  const height = (width * canvas.height) / canvas.width;
  const page = out.addPage([width, height]);
  page.drawImage(jpg, { x: 0, y: 0, width, height });
  return page;
}

interface LibOutline {
  title: string;
  page: PDFPage;
  ratio: number;
  kids: LibOutline[];
}

/**
 * Nota con dei blocchi PDF: si costruisce con pdf-lib. Le pagine di testo restano immagini (come
 * sempre); quelle dei PDF sono le pagine originali, con l'inchiostro disegnato sopra come tracciati.
 * Un PDF cifrato non si copia: si ripiega sulle sue pagine come immagini, se si apre senza password.
 */
async function renderNotePdfWithBlocks(pages: NotePage[], meta: ExportMeta, options: RenderOptions): Promise<Uint8Array> {
  const lib = await import("pdf-lib");
  const out = await lib.PDFDocument.create();
  const opts = { ...options, scale: safeScale(options.scale, pages.filter((p) => !p.pdf).length) };
  const withCount = { ...meta, pageCount: pages.length };
  const outline: LibOutline[] = [];
  let anyMark = false;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!page.pdf) {
      const r = await renderPage(page, i + 1, withCount, opts);
      const target = await addImagePage(out, r.canvas);
      anyMark ||= r.marks.length > 0;
      outline.push({ title: `Pagina ${i + 1}`, page: target, ratio: 0, kids: r.marks.map((m) => ({ title: m.title, page: target, ratio: m.ratio, kids: [] })) });
      continue;
    }
    let added: PDFPage[] = [];
    try {
      added = await appendPdfBlock(out, page, meta.noteDir ?? null);
    } catch (error) {
      console.error(`PDF «${page.pdf.name}» non copiato, lo esporto come immagini:`, error);
      for (const canvas of await renderPdfBlockCanvases(page, meta.noteDir ?? null, Math.round(PAPER_WIDTH * opts.scale))) {
        added.push(await addImagePage(out, canvas));
      }
    }
    if (added.length === 0) {
      // Protetto da password o illeggibile: una pagina che lo dice, invece di sparire in silenzio.
      const font = await out.embedFont(lib.StandardFonts.Helvetica);
      const note = out.addPage([595.28, 160]);
      const text = /^[\x20-\x7e\u00a0-\u00ff]*$/.test(page.pdf.name) ? `PDF "${page.pdf.name}" non esportato (protetto o illeggibile)` : "PDF non esportato (protetto o illeggibile)";
      note.drawText(text, { x: 36, y: 74, size: 12, font });
      added.push(note);
    }
    anyMark = true;
    outline.push({ title: `PDF: ${page.pdf.name}`, page: added[0], ratio: 0, kids: [] });
  }

  if (anyMark) addLibOutlines(lib, out, outline);
  return out.save();
}

/** Segnalibri del PDF (pdf-lib non ha una funzione per farli: si scrivono gli oggetti a mano). */
function addLibOutlines(lib: typeof import("pdf-lib"), out: PDFDocument, items: LibOutline[]) {
  if (items.length === 0) return;
  const ctx = out.context;
  const rootRef = ctx.nextRef();
  const refs = new Map<LibOutline, ReturnType<typeof ctx.nextRef>>();
  const all = (list: LibOutline[]): LibOutline[] => list.flatMap((n) => [n, ...all(n.kids)]);
  for (const node of all(items)) refs.set(node, ctx.nextRef());
  const dest = (node: LibOutline) => {
    const height = node.page.getHeight();
    return ctx.obj([node.page.ref, "XYZ", null, Math.min(height, height * (1 - node.ratio) + 24), null]);
  };
  const write = (list: LibOutline[], parent: ReturnType<typeof ctx.nextRef>) => {
    list.forEach((node, i) => {
      const dict = ctx.obj({ Title: lib.PDFHexString.fromText(node.title), Parent: parent, Dest: dest(node) });
      if (i > 0) dict.set(lib.PDFName.of("Prev"), refs.get(list[i - 1])!);
      if (i < list.length - 1) dict.set(lib.PDFName.of("Next"), refs.get(list[i + 1])!);
      if (node.kids.length > 0) {
        dict.set(lib.PDFName.of("First"), refs.get(node.kids[0])!);
        dict.set(lib.PDFName.of("Last"), refs.get(node.kids[node.kids.length - 1])!);
        dict.set(lib.PDFName.of("Count"), lib.PDFNumber.of(node.kids.length));
      }
      ctx.assign(refs.get(node)!, dict);
      write(node.kids, refs.get(node)!);
    });
  };
  write(items, rootRef);
  ctx.assign(
    rootRef,
    ctx.obj({ Type: "Outlines", First: refs.get(items[0])!, Last: refs.get(items[items.length - 1])!, Count: all(items).length })
  );
  out.catalog.set(lib.PDFName.of("Outlines"), rootRef);
  out.catalog.set(lib.PDFName.of("PageMode"), lib.PDFName.of("UseOutlines"));
}

/** Testo per il PDF in UTF-16BE (accenti e simboli compresi), come stringa esadecimale. */
function pdfText(text: string): string {
  let hex = "FEFF";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 63;
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, "0") + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
    } else hex += cp.toString(16).padStart(4, "0");
  }
  return `<${hex.toUpperCase()}>`;
}

/** Una voce dei segnalibri del PDF: titolo, pagina e altezza (frazione dall'alto); le voci "Pagina N" hanno figli. */
interface OutlineNode {
  id: number;
  title: string;
  page: number;
  ratio: number;
  kids: OutlineNode[];
}

/**
 * PDF minimale: una pagina per immagine JPEG, larga come un A4 (595pt). Con dei segni, il PDF ha i suoi
 * segnalibri (/Outlines): "Pagina N" e dentro i segni di quella pagina (con una pagina sola, i segni e basta).
 */
function buildPdf(images: { data: Uint8Array; w: number; h: number }[], marks: ExportMark[][] = []): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let position = 0;

  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    position += bytes.length;
  };
  const object = (n: number, write: () => void) => {
    offsets[n] = position;
    push(`${n} 0 obj\n`);
    write();
    push("\nendobj\n");
  };

  const pageWidth = 595.28;
  push("%PDF-1.4\n%âãÏÓ\n");

  const firstPage = 3;
  const pageIds = images.map((_, i) => firstPage + i * 3);

  // Numeri degli oggetti dei segnalibri: dopo quelli delle pagine.
  let nextId = firstPage + images.length * 3;
  const withMarks = marks.map((list, page) => ({ page, list })).filter((g) => g.list.length > 0 && g.page < images.length);
  const leaf = (m: ExportMark, page: number): OutlineNode => ({ id: nextId++, title: m.title, page, ratio: m.ratio, kids: [] });
  const outlineRoot = withMarks.length > 0 ? nextId++ : 0;
  const top: OutlineNode[] =
    images.length === 1
      ? withMarks.flatMap((g) => g.list.map((m) => leaf(m, g.page)))
      : withMarks.map((g) => {
          const id = nextId++;
          return { id, title: `Pagina ${g.page + 1}`, page: g.page, ratio: 0, kids: g.list.map((m) => leaf(m, g.page)) };
        });

  object(1, () =>
    push(`<< /Type /Catalog /Pages 2 0 R${outlineRoot ? ` /Outlines ${outlineRoot} 0 R /PageMode /UseOutlines` : ""} >>`)
  );
  object(2, () =>
    push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${images.length} >>`)
  );

  images.forEach((image, i) => {
    const pageId = pageIds[i];
    const height = (pageWidth * image.h) / image.w;
    const content = `q ${pageWidth.toFixed(2)} 0 0 ${height.toFixed(2)} 0 0 cm /Im0 Do Q`;
    object(pageId, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${height.toFixed(2)}] ` +
          `/Resources << /XObject << /Im0 ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`
      )
    );
    object(pageId + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(pageId + 2, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /DeviceRGB ` +
          `/BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n`
      );
      push(image.data);
      push("\nendstream");
    });
  });

  if (outlineRoot) {
    const total = top.reduce((n, node) => n + 1 + node.kids.length, 0);
    object(outlineRoot, () => push(`<< /Type /Outlines /First ${top[0].id} 0 R /Last ${top[top.length - 1].id} 0 R /Count ${total} >>`));
    const writeLevel = (nodes: OutlineNode[], parent: number) => {
      nodes.forEach((node, i) => {
        const image = images[node.page];
        const height = (pageWidth * image.h) / image.w;
        // Un po' sopra il segno, così si vede anche la riga prima.
        const y = Math.min(height, height * (1 - node.ratio) + 24);
        const links =
          (i > 0 ? ` /Prev ${nodes[i - 1].id} 0 R` : "") +
          (i < nodes.length - 1 ? ` /Next ${nodes[i + 1].id} 0 R` : "") +
          (node.kids.length > 0 ? ` /First ${node.kids[0].id} 0 R /Last ${node.kids[node.kids.length - 1].id} 0 R /Count ${node.kids.length}` : "");
        object(node.id, () =>
          push(`<< /Title ${pdfText(node.title)} /Parent ${parent} 0 R${links} /Dest [${pageIds[node.page]} 0 R /XYZ 0 ${y.toFixed(2)} null] >>`)
        );
        writeLevel(node.kids, node.id);
      });
    };
    writeLevel(top, outlineRoot);
  }

  const count = nextId;
  const xrefStart = position;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const out = new Uint8Array(position);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

// ---------------------------------------------------------------------
// Salvataggio su disco (finestra "Salva con nome")
// ---------------------------------------------------------------------

export async function saveBytes(defaultName: string, extension: string, label: string, bytes: Uint8Array): Promise<boolean> {
  const path = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [extension] }] });
  if (!path) return false;
  await writeFile(path, bytes);
  return true;
}

/**
 * Markdown di una nota con dei PDF: si sceglie una CARTELLA (la finestra di sistema dà il permesso
 * di scriverci) e lì vanno il .md e le copie dei PDF, linkati per nome. Niente sovrascritture:
 * un nome già usato diventa "nome (2)". false = annullato.
 */
export async function saveMarkdownWithPdfs(base: string, title: string, pages: NotePage[], titleColor: string | null, noteDir: string | null): Promise<boolean> {
  const folder = await openDialog({ directory: true, multiple: false, title: "Scegli la cartella per la nota e i suoi PDF" });
  if (typeof folder !== "string") return false;
  const free = async (name: string): Promise<string> => {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let n = 2; n < 1000; n++) {
      const taken = await exists(await join(folder, candidate)).catch(() => false);
      if (!taken) return candidate;
      candidate = `${stem} (${n})${ext}`;
    }
    return candidate;
  };
  const names = new Map<string, string>();
  for (const p of pages) {
    if (!p.pdf || names.has(p.pdf.file)) continue;
    const target = await free(p.pdf.file);
    names.set(p.pdf.file, target);
    await writeFile(await join(folder, target), await readNotePdf(noteDir, p.pdf.file));
  }
  // Anche i collegamenti nel testo (al PDF di un blocco della nota) puntano alla copia salvata qui.
  const md = noteToMarkdown(title, pages, titleColor, (file) => names.get(file) ?? file);
  await writeTextFile(await join(folder, await free(`${base}.md`)), md);
  return true;
}

export async function saveText(defaultName: string, extension: string, label: string, text: string): Promise<boolean> {
  const path = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [extension] }] });
  if (!path) return false;
  await writeTextFile(path, text);
  return true;
}
