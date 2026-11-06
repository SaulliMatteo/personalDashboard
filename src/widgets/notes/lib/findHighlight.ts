/**
 * Evidenziazione dei risultati della ricerca (Ctrl+F) con la CSS Highlight API: non tocca il DOM
 * della pagina (che non è di React). La usano FindBar (testo) e la ricerca nei PDF.
 */

export const FIND_ALL = "nq-find";
export const FIND_CURRENT = "nq-find-current";

export function highlightsSupported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
}

export function clearHighlights() {
  if (!highlightsSupported()) return;
  CSS.highlights.delete(FIND_ALL);
  CSS.highlights.delete(FIND_CURRENT);
}

/** Quante volte `needle` compare in `text` (già in minuscolo). */
export function countIn(text: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Intervalli del testo cercato dentro `root`, anche quando una parola attraversa più nodi. */
export function rangesIn(root: HTMLElement, needle: string): Range[] {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    nodes.push(node);
    starts.push(text.length);
    text += node.data;
  }
  const lower = text.toLowerCase();
  const point = (at: number) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > at) i--;
    return { node: nodes[i], offset: at - starts[i] };
  };
  const ranges: Range[] = [];
  for (let i = lower.indexOf(needle); i >= 0 && needle; i = lower.indexOf(needle, i + needle.length)) {
    const a = point(i);
    const b = point(i + needle.length);
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    ranges.push(range);
  }
  return ranges;
}
