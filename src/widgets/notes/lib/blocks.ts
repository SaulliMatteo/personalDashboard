import { defaultEdit, initialWidth, parseImageEdit, parseWidth, serializeImageEdit } from "./imageEdit";
import { stripLookVars } from "./tableDom";

/**
 * Blocchi nella pagina: <figure data-block="image">, <div data-block="file"> e
 * <div data-block="collection-view" data-view="ID"> (vista collegata di una raccolta).
 * Riferimenti a una riga di raccolta: <span data-ref-row="ID">titolo</span> nel testo.
 * Nell'HTML salvato c'è solo la descrizione (file, modifiche, didascalia); quello che si vede
 * (immagine, barra, maniglie, scheda del file) lo disegna React dentro un nodo "di servizio"
 * [data-runtime], che non viene mai salvato.
 */

export const BLOCK_SELECTOR = '[data-block="image"], [data-block="file"], [data-block="collection-view"]';
export type BlockKind = "image" | "file" | "view";

function kindOf(el: HTMLElement): BlockKind {
  return el.dataset.block === "collection-view" ? "view" : el.dataset.block === "file" ? "file" : "image";
}

/** HTML da salvare: senza i nodi di React e senza gli attributi messi solo per l'editor. */
export function serializeEditor(root: HTMLElement): string {
  if (!root.querySelector("[data-runtime], [data-block], [data-cur], [data-ref-row], table")) return root.innerHTML;
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-runtime]").forEach((n) => n.remove());
  // La riga della tabella dove sta il cursore (lib/tableDom.ts): solo per l'editor.
  clone.querySelectorAll("[data-cur]").forEach((n) => n.removeAttribute("data-cur"));
  // Colori delle tabelle in linea: si rifanno dagli attributi (lib/tableDom.ts).
  stripLookVars(clone);
  clone.querySelectorAll("[data-ref-row]").forEach((el) => {
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-missing");
  });
  clone.querySelectorAll<HTMLElement>("[data-block]").forEach((el) => {
    el.removeAttribute("contenteditable");
    el.removeAttribute("tabindex");
    el.removeAttribute("data-selected");
    el.removeAttribute("data-moving");
    el.removeAttribute("style"); // posizione delle immagini libere: si ricalcola dagli attributi
    el.querySelectorAll("figcaption").forEach((c) => c.removeAttribute("contenteditable"));
  });
  return clone.innerHTML;
}

/**
 * Prepara i blocchi per l'editor: non modificabili come testo (la didascalia sì), raggiungibili
 * con Tab, e con il nodo in cui React disegna. Restituisce i blocchi con il loro nodo.
 */
export function hydrateBlocks(root: HTMLElement): { el: HTMLElement; host: HTMLElement; kind: BlockKind }[] {
  const out: { el: HTMLElement; host: HTMLElement; kind: BlockKind }[] = [];
  root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR).forEach((el) => {
    // Solo blocchi di primo livello: un blocco dentro un altro (incolla strano) non vale.
    if (el.parentElement !== root) return;
    const kind = kindOf(el);
    if (el.getAttribute("contenteditable") !== "false") el.setAttribute("contenteditable", "false");
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    el.querySelectorAll("figcaption").forEach((c) => {
      if (c.getAttribute("contenteditable") !== "true") c.setAttribute("contenteditable", "true");
    });
    let host = el.querySelector<HTMLElement>(":scope > [data-runtime]");
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("data-runtime", kind);
      host.setAttribute("contenteditable", "false");
      el.prepend(host);
    }
    out.push({ el, host, kind });
  });
  // I riferimenti a una riga sono un pezzo unico nel testo (si cancellano interi).
  root.querySelectorAll<HTMLElement>("[data-ref-row]").forEach((el) => {
    if (el.getAttribute("contenteditable") !== "false") el.setAttribute("contenteditable", "false");
  });
  return out;
}

/** Il blocco di una vista collegata (la vista è una riga di note_collection_views). */
export function createViewBlock(viewId: number): HTMLElement {
  const el = document.createElement("div");
  el.dataset.block = "collection-view";
  el.dataset.view = String(viewId);
  return el;
}

/** Il riferimento a una riga: un chip nel testo con il titolo della riga. */
export function createRowRef(rowId: number, title: string): HTMLElement {
  const el = document.createElement("span");
  el.dataset.refRow = String(rowId);
  el.setAttribute("contenteditable", "false");
  el.textContent = title || "Senza titolo";
  return el;
}

/** Il nuovo blocco per un'immagine appena aggiunta. */
export function createImageBlock(name: string, nw: number, nh: number): HTMLElement {
  const figure = document.createElement("figure");
  figure.dataset.block = "image";
  figure.dataset.attachment = name;
  figure.dataset.align = "center";
  figure.dataset.width = String(initialWidth(nw));
  figure.dataset.edit = serializeImageEdit(defaultEdit(nw, nh));
  return figure;
}

/** La scheda di un file allegato nella pagina. */
export function createFileBlock(name: string, bytes: number): HTMLElement {
  const card = document.createElement("div");
  card.dataset.block = "file";
  card.dataset.attachment = name;
  card.dataset.bytes = String(bytes);
  return card;
}

/** Il blocco di primo livello che contiene il punto (o null se il punto è fuori dalla pagina). */
function topLevelOf(root: HTMLElement, node: Node | null): Element | null {
  let n: Node | null = node;
  if (!n || !root.contains(n) || n === root) return null;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n instanceof Element ? n : null;
}

function isEmptyParagraph(el: Element | null): boolean {
  return !!el && el.tagName === "P" && (el.textContent ?? "").replace(/​/g, "").trim() === "" && !el.querySelector("img, [data-block]");
}

/**
 * Mette i blocchi nella pagina dove sta `at` (cursore o punto di rilascio): dopo il paragrafo
 * (o la tabella) che lo contiene, o al suo posto se è vuoto; in fondo se `at` è fuori. Dopo
 * l'ultimo blocco resta sempre un paragrafo in cui scrivere, e il cursore va lì.
 */
export function insertBlocks(root: HTMLElement, at: Range | null, blocks: Node[]): void {
  if (blocks.length === 0) return;
  const anchor = topLevelOf(root, at?.startContainer ?? null);
  const fragment = document.createDocumentFragment();
  for (const b of blocks) fragment.appendChild(b);
  const last = blocks[blocks.length - 1];
  if (anchor && isEmptyParagraph(anchor)) anchor.replaceWith(fragment);
  else if (anchor) anchor.after(fragment);
  else root.appendChild(fragment);

  let next = (last as Element).nextElementSibling;
  if (!next || next.matches(BLOCK_SELECTOR) || next.tagName === "TABLE") {
    const p = document.createElement("p");
    p.appendChild(document.createElement("br"));
    (last as Element).after(p);
    next = p;
  }
  const sel = window.getSelection();
  if (sel && next) {
    const caret = document.createRange();
    caret.setStart(next, 0);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
  }
}

/** Il punto della pagina sotto le coordinate (rilascio di un file). */
export function caretAt(root: HTMLElement, x: number, y: number): Range | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let range: Range | null = null;
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  } else if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  }
  return range && root.contains(range.startContainer) ? range : null;
}

/** Il blocco (immagine o file) che ha il focus della tastiera, se è in questa pagina. */
export function focusedBlock(root: HTMLElement | null): HTMLElement | null {
  const el = document.activeElement;
  return root && el instanceof HTMLElement && el.parentElement === root && el.matches(BLOCK_SELECTOR) ? el : null;
}

// ---------------------------------------------------------------------
// Immagine "libera" sulla pagina (data-x, data-y): come un adesivo, sopra il testo.
// Le coordinate sono frazioni della LARGHEZZA della pagina, misurate dall'origine dell'inchiostro
// (vedi .nq-ink): immagine e scrittura a mano restano allineate, anche nell'esportazione.
// ---------------------------------------------------------------------

/** Origine verticale dell'inchiostro in CSS (testata − 2.82em, mai negativa). */
const INK_ORIGIN = "max(0px, calc(var(--nq-head-h, 2.82em) - 2.82em))";

export function freePosition(el: HTMLElement): { x: number; y: number } | null {
  if (el.dataset.x === undefined || el.dataset.y === undefined) return null;
  const x = Number(el.dataset.x);
  const y = Number(el.dataset.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Valore valido per data-x / data-y (o null). */
export function asFreeCoord(name: "data-x" | "data-y", raw: string): string | null {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return null;
  const v = name === "data-x" ? Math.min(1, Math.max(0, n)) : Math.min(50, Math.max(-1, n));
  return String(Math.round(v * 10000) / 10000);
}

/**
 * Posizione e larghezza in linea di un'immagine libera (si ricalcolano dagli attributi a ogni
 * disegno; serializeEditor toglie lo style prima di salvare). La larghezza (data-width) è in %
 * della larghezza del testo, come per le immagini nel testo.
 */
export function applyFreeStyle(el: HTMLElement): void {
  const pos = freePosition(el);
  if (!pos) {
    el.style.removeProperty("left");
    el.style.removeProperty("top");
    el.style.removeProperty("width");
    return;
  }
  const width = parseWidth(el.dataset.width) ?? initialWidth(parseImageEdit(el.dataset.edit).nw);
  el.style.left = `${pos.x * 100}%`;
  el.style.top = `calc(${INK_ORIGIN} + ${pos.y} * var(--nq-paper-w, 870px))`;
  // La pagina ha 3.4em di margine per lato: il testo è largo (100% − 6.8em).
  el.style.width = `calc((100% - 6.8em) * ${width / 100})`;
}

/** Origine dell'inchiostro in px, dentro la pagina `paper`. */
export function inkOriginPx(paper: HTMLElement): number {
  const head = paper.querySelector<HTMLElement>(":scope > .nq-page-head");
  const em = parseFloat(getComputedStyle(paper).fontSize) || 15;
  return Math.max(0, (head?.offsetHeight ?? 2.82 * em) - 2.82 * em);
}
