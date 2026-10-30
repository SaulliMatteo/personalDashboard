/**
 * Selezione ↔ posizione nel testo (numero di caratteri dall'inizio della radice).
 * Serve a rimettere il cursore dopo che l'HTML della pagina è stato riscritto (annulla/ripeti,
 * blocco spostato): i nodi DOM cambiano, la posizione nel testo no.
 */

export interface TextOffsets {
  start: number;
  end: number;
}

function offsetOf(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** Posizione della selezione dentro `root`, o null se la selezione è altrove. */
export function getTextOffsets(root: HTMLElement): TextOffsets | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return {
    start: offsetOf(root, range.startContainer, range.startOffset),
    end: offsetOf(root, range.endContainer, range.endOffset),
  };
}

/** Punto (nodo di testo + offset) che corrisponde a `target` caratteri dall'inizio. */
function pointAt(root: HTMLElement, target: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const length = node.data.length;
    if (seen + length >= target) return { node, offset: target - seen };
    seen += length;
    last = node;
  }
  if (last) return { node: last, offset: last.data.length };
  return { node: root, offset: root.childNodes.length };
}

/** Rimette la selezione (se la posizione è oltre la fine, va in fondo). */
export function setTextOffsets(root: HTMLElement, offsets: TextOffsets): void {
  const sel = window.getSelection();
  if (!sel) return;
  const a = pointAt(root, Math.max(0, offsets.start));
  const b = offsets.end === offsets.start ? a : pointAt(root, Math.max(0, offsets.end));
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}
