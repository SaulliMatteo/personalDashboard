import { appendTokens, highlightCode } from "./codeHighlight";
import { asCodeLang, asLangName, langLabel } from "./codeLanguages";
import { attachmentDataUrl, extensionOf } from "./attachmentUrls";
import { imageLayout, parseImageEdit } from "./imageEdit";
import { formatBytes } from "./insertFiles";
import { applyFreeStyle } from "./blocks";
import { asStrokes, THEME_INK } from "./ink";

/**
 * Esportazione (PDF, PNG, JPG): la pagina viene disegnata come immagine SVG, dove non girano né
 * React né i blob: degli allegati. Qui i blocchi diventano HTML statico con le stesse classi del
 * CSS dell'editor; le immagini sono incorporate come data: URL.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

function inkSvg(raw: string | undefined, ink: string, aspect: number): SVGSVGElement | null {
  let strokes;
  try {
    strokes = asStrokes(JSON.parse(raw ?? "[]"));
  } catch {
    return null;
  }
  if (strokes.length === 0) return null;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "nq-img-ink");
  // Coordinate sulla larghezza del riquadro (come InkLayer): il riquadro è alto 1/aspect.
  svg.setAttribute("viewBox", `0 0 1 ${1 / aspect}`);
  svg.setAttribute("preserveAspectRatio", "none");
  for (const s of strokes) {
    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", s.points.map(([x, y]) => `${x},${y}`).join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", s.color.toLowerCase() === THEME_INK ? ink : s.color);
    line.setAttribute("stroke-width", String((s.size * (s.tool === "highlighter" ? 5 : 1)) / 900));
    line.setAttribute("stroke-opacity", s.tool === "highlighter" ? "0.35" : "1");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);
  }
  return svg;
}

async function staticImage(figure: HTMLElement, noteDir: string | null, ink: string) {
  const edit = parseImageEdit(figure.dataset.edit);
  const layout = imageLayout(edit);
  const box = document.createElement("div");
  box.className = "nq-imgbox";
  box.style.aspectRatio = String(layout.aspect);
  const name = figure.dataset.attachment ?? "";
  let src: string | null = null;
  if (noteDir && name) src = await attachmentDataUrl(noteDir, name).catch(() => null);
  if (src) {
    const inner = document.createElement("div");
    inner.className = "nq-img-inner";
    inner.style.width = `${layout.inner.width}%`;
    inner.style.height = `${layout.inner.height}%`;
    inner.style.transform = layout.inner.transform;
    const img = document.createElement("img");
    img.src = src;
    img.alt = name;
    img.style.width = `${layout.image.width}%`;
    img.style.height = `${layout.image.height}%`;
    img.style.left = `${layout.image.left}%`;
    img.style.top = `${layout.image.top}%`;
    img.style.filter = layout.image.filter;
    inner.appendChild(img);
    box.appendChild(inner);
    await img.decode().catch(() => undefined);
  } else {
    const missing = document.createElement("div");
    missing.className = "nq-img-missing";
    missing.textContent = `Immagine non trovata: ${name}`;
    box.appendChild(missing);
  }
  const drawn = inkSvg(figure.dataset.ink, ink, layout.aspect);
  if (drawn) box.appendChild(drawn);
  figure.prepend(box);
  applyFreeStyle(figure); // immagine libera: stessa posizione della pagina
}

function staticFile(block: HTMLElement) {
  const name = block.dataset.attachment ?? "";
  const bytes = Number(block.dataset.bytes ?? 0);
  const ext = extensionOf(name).toUpperCase().slice(0, 4) || "FILE";
  const card = document.createElement("div");
  card.className = "nq-file";
  if (ext === "PDF") card.dataset.pdf = "";
  const ico = document.createElement("span");
  ico.className = "nq-file-ico";
  ico.textContent = ext;
  const info = document.createElement("div");
  info.className = "nq-file-info";
  const title = document.createElement("b");
  title.textContent = name;
  const size = document.createElement("small");
  size.textContent = bytes > 0 ? formatBytes(bytes) : "File allegato";
  info.append(title, size);
  card.append(ico, info);
  block.prepend(card);
}

/** Riempie i blocchi della pagina da esportare (dentro `root`, già nel documento). */
/**
 * Blocco di codice per l'esportazione: barra con il linguaggio e il codice evidenziato. I nodi
 * si creano con createElement + textContent dall'albero di token (lib/codeHighlight.ts):
 * niente innerHTML, quindi niente HTML del codice viene mai interpretato.
 */
function staticCode(pre: HTMLElement) {
  const doc = pre.ownerDocument;
  const name = asLangName(pre.getAttribute("data-lang"));
  const text = pre.querySelector("code")?.textContent ?? "";
  const bar = doc.createElement("div");
  bar.className = "nq-code-static-bar";
  bar.textContent = langLabel(name);
  const code = doc.createElement("code");
  code.className = "nq-code-static nq-hl";
  appendTokens(doc, code, highlightCode(text, asCodeLang(name)));
  pre.replaceChildren(bar, code);
}

export async function renderStaticBlocks(root: HTMLElement, noteDir: string | null): Promise<void> {
  const ink = getComputedStyle(root).getPropertyValue("--note-page-ink").trim() || THEME_INK;
  const work: Promise<void>[] = [];
  root.querySelectorAll<HTMLElement>('figure[data-block="image"]').forEach((f) => work.push(staticImage(f, noteDir, ink)));
  root.querySelectorAll<HTMLElement>('div[data-block="file"]').forEach((b) => staticFile(b));
  root.querySelectorAll<HTMLElement>('pre[data-block="code"]').forEach((p) => staticCode(p));
  await Promise.all(work);
}
