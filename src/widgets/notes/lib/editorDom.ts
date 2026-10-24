import { focusedBlock } from "./blocks";

/**
 * Blocco "corrente" dell'editor: l'<li> che contiene il cursore, altrimenti
 * il figlio diretto della radice. Null se il cursore è fuori dall'editor o
 * se il testo è ancora "nudo" (senza blocco).
 */
export function currentBlock(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  let node: Node | null = window.getSelection()?.anchorNode ?? null;
  if (!node || !root.contains(node)) return null;

  let found: HTMLElement | null = null;
  while (node && node !== root) {
    if (node instanceof HTMLElement && (node.tagName === "LI" || node.parentNode === root)) {
      found = node;
      if (node.tagName === "LI") break;
    }
    node = node.parentNode;
  }
  return found;
}

/** Trasforma la riga corrente in voce di checklist (o la riporta a testo normale). */
export function toggleChecklist(root: HTMLElement): boolean {
  let block = currentBlock(root);
  if (!block) {
    document.execCommand("formatBlock", false, "<p>");
    block = currentBlock(root);
  }
  if (!block) return false;
  if (block.hasAttribute("data-check")) block.removeAttribute("data-check");
  else block.setAttribute("data-check", "0");
  return true;
}

/** Aggiunge https:// se manca lo schema; accetta solo http(s) e mailto. */
export function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  return /^(https?:|mailto:)/i.test(withScheme) ? withScheme : null;
}

const ZWSP = "\u200b";

function selectionIn(root: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? range : null;
}

/**
 * Dimensione in px (a zoom 100%) del testo. Si scrive come calc(N * var(--nq-px)),
 * così segue lo zoom della pagina come il resto del testo.
 */
export function applyFontSize(root: HTMLElement, px: number): boolean {
  const range = selectionIn(root);
  if (!range) return false;
  const value = `calc(${px} * var(--nq-px))`;
  const sel = window.getSelection();

  if (range.collapsed) {
    // Nessun testo selezionato: da qui in poi si scrive con la nuova dimensione.
    const span = document.createElement("span");
    span.style.fontSize = value;
    const text = document.createTextNode(ZWSP);
    span.appendChild(text);
    range.insertNode(span);
    const caret = document.createRange();
    caret.setStart(text, 1);
    caret.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(caret);
    return true;
  }

  // fontSize accetta solo 1-7: si usa 7 come "segnaposto" e lo si sostituisce con la dimensione vera.
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand("fontSize", false, "7");
  const spans: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>('font[size="7"]').forEach((font) => {
    const span = document.createElement("span");
    span.style.fontSize = value;
    while (font.firstChild) span.appendChild(font.firstChild);
    span.querySelectorAll<HTMLElement>("[style]").forEach((el) => el.style.removeProperty("font-size"));
    font.replaceWith(span);
    spans.push(span);
  });
  if (spans.length > 0 && sel) {
    const again = document.createRange();
    again.setStartBefore(spans[0]);
    again.setEndAfter(spans[spans.length - 1]);
    sel.removeAllRanges();
    sel.addRange(again);
  }
  return true;
}

export function applyTextColor(root: HTMLElement, color: string): boolean {
  if (!selectionIn(root)) return false;
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand("foreColor", false, color);
  // Va rimesso a false: altrimenti grassetto e corsivo diventerebbero <span style>.
  document.execCommand("styleWithCSS", false, "false");
  return true;
}

export function clearFormatting(root: HTMLElement): boolean {
  if (!selectionIn(root)) return false;
  document.execCommand("removeFormat");
  return true;
}

/** Dimensione (px a zoom 100%) del testo sotto il cursore, per mostrarla nella toolbar. */
export function currentFontSizePx(root: HTMLElement, zoom: number): number | null {
  const node = window.getSelection()?.anchorNode;
  if (!node || !root.contains(node)) return null;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  if (!el) return null;
  const px = parseFloat(getComputedStyle(el).fontSize) / zoom;
  return Number.isFinite(px) ? Math.round(px) : null;
}
/** Il figlio diretto della radice che contiene il cursore (paragrafo, titolo, elenco intero…),
 *  oppure il blocco immagine/file che ha il focus. */
export function topBlock(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const focused = focusedBlock(root);
  if (focused) return focused;
  let node: Node | null = window.getSelection()?.anchorNode ?? null;
  if (!node || !root.contains(node) || node === root) return null;
  while (node && node.parentNode !== root) node = node.parentNode;
  return node instanceof HTMLElement ? node : null;
}

/** Posizione del blocco tra i figli della radice: distingue "stesso blocco" per la cronologia. */
export function topBlockKey(root: HTMLElement | null): string | undefined {
  const block = topBlock(root);
  if (!root || !block) return undefined;
  return String(Array.prototype.indexOf.call(root.children, block));
}

/** Spunta/toglie la riga di checklist sotto il cursore. False se il cursore non è in una checklist. */
export function toggleCurrentCheck(root: HTMLElement): boolean {
  const block = currentBlock(root);
  if (!block?.hasAttribute("data-check")) return false;
  block.setAttribute("data-check", block.getAttribute("data-check") === "1" ? "0" : "1");
  return true;
}
