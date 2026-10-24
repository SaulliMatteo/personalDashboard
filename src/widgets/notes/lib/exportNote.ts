import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { NotePage } from "../data/notesRepository";
import { htmlToMarkdown, monthYear, sanitizeHtml } from "./html";
import { isPageColorKey, luminance, paperVars } from "./pageColor";
import type { NoteFont } from "./textStyle";
import { renderStaticBlocks } from "./blockExport";
import { layoutTables } from "./tableDom";
import { THEME_INK, drawStrokes } from "./ink"; // al posto del solo drawStrokes

export interface ExportMeta {
  title: string;
  /** "LAVORO / PROGETTO ATLANTE" */
  kicker: string;
  createdAt: number;
  /** Font predefinito della nota. */
  font?: NoteFont | null;
  /** Cartella della nota su disco: da lì si leggono le immagini dei blocchi. */
  noteDir?: string | null;
}

export interface RenderOptions {
  /** Fattore di risoluzione (3 = tre volte i pixel dello schermo). */
  scale: number;
  /** Sfondo chiaro anche se l'app è in tema scuro (adatto alla stampa). */
  light: boolean;
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

export function noteToMarkdown(title: string, pages: NotePage[]): string {
  const body = pages.map((p) => htmlToMarkdown(p.content)).join("\n\n---\n\n");
  return `# ${title || "Senza titolo"}\n\n${body}\n`;
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

  const doc = paper.querySelector<HTMLElement>(".nq-doc");
  if (doc) {
    doc.innerHTML = sanitizeHtml(page.content);
    layoutTables(doc); // larghezze delle colonne
  }

  stage.appendChild(paper);
  document.body.appendChild(stage);

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

async function renderPage(
  page: NotePage,
  number: number,
  meta: ExportMeta,
  { scale, light }: RenderOptions
): Promise<HTMLCanvasElement> {
  // L'altezza deve contenere anche i tratti disegnati in basso.
  const lowestStroke = page.ink.reduce((max, s) => s.points.reduce((m, [, y]) => Math.max(m, y), max), 0);
  const minHeight = Math.ceil(Math.max(840, lowestStroke * PAPER_WIDTH + 32));

  const { stage, paper } = buildStage(page, number, meta, light, minHeight);
  try {
    // Immagini e schede file come HTML statico (prima di misurare l'altezza).
    await renderStaticBlocks(paper, meta.noteDir ?? null);
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
    return canvas;
  } finally {
    stage.remove();
  }
}

/** Scala massima che tiene l'altezza sotto il limite dei canvas dei browser. */
function safeScale(wanted: number, pages: NotePage[]): number {
  const approxHeight = Math.max(1, pages.length) * 900;
  return Math.max(1, Math.min(wanted, 14000 / approxHeight));
}

async function renderAll(pages: NotePage[], meta: ExportMeta, options: RenderOptions): Promise<HTMLCanvasElement[]> {
  const opts = { ...options, scale: safeScale(options.scale, pages) };
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < pages.length; i++) canvases.push(await renderPage(pages[i], i + 1, meta, opts));
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

export async function renderNoteImage(
  pages: NotePage[],
  meta: ExportMeta,
  format: "png" | "jpeg",
  options: RenderOptions
): Promise<Uint8Array> {
  const canvases = await renderAll(pages, meta, options);
  const gap = Math.round(24 * canvases[0].width / PAPER_WIDTH);
  const total = canvases.reduce((sum, c) => sum + c.height, 0) + gap * (canvases.length - 1);

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
  const canvases = await renderAll(pages, meta, options);
  const jpegs = [];
  for (const c of canvases) jpegs.push({ data: await blobBytes(await toBlob(c, "image/jpeg", 0.92)), w: c.width, h: c.height });
  return buildPdf(jpegs);
}

/** PDF minimale: una pagina per immagine JPEG, larga come un A4 (595pt). */
function buildPdf(images: { data: Uint8Array; w: number; h: number }[]): Uint8Array {
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
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
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

  const count = firstPage + images.length * 3;
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

export async function saveText(defaultName: string, extension: string, label: string, text: string): Promise<boolean> {
  const path = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [extension] }] });
  if (!path) return false;
  await writeTextFile(path, text);
  return true;
}
