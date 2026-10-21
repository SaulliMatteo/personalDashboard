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
