import { defaultEdit, initialWidth, serializeImageEdit } from "./imageEdit";

/**
 * Blocchi nella pagina: <figure data-block="image"> e <div data-block="file">.
 * Nell'HTML salvato c'è solo la descrizione (file, modifiche, didascalia); quello che si vede
 * (immagine, barra, maniglie, scheda del file) lo disegna React dentro un nodo "di servizio"
 * [data-runtime], che non viene mai salvato.
 */

export const BLOCK_SELECTOR = '[data-block="image"], [data-block="file"]';
export type BlockKind = "image" | "file";

/** HTML da salvare: senza i nodi di React e senza gli attributi messi solo per l'editor. */
export function serializeEditor(root: HTMLElement): string {
  if (!root.querySelector("[data-runtime], [data-block]")) return root.innerHTML;
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-runtime]").forEach((n) => n.remove());
  clone.querySelectorAll<HTMLElement>("[data-block]").forEach((el) => {
    el.removeAttribute("contenteditable");
    el.removeAttribute("tabindex");
    el.removeAttribute("data-selected");
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
    const kind = el.dataset.block as BlockKind;
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
  return out;
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
 * che lo contiene, o al suo posto se è vuoto; in fondo se `at` è fuori. Dopo l'ultimo blocco
 * resta sempre un paragrafo in cui scrivere, e il cursore va lì.
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
  if (!next || next.matches(BLOCK_SELECTOR)) {
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
