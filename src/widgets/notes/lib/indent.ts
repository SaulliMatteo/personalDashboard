/**
 * Tab / Shift+Tab nel testo della pagina (contentEditable). Niente execCommand("indent"): in
 * Chromium mette i paragrafi in <blockquote style="margin-left:40px"> e annida <ul> dentro <ul>.
 *
 * - Paragrafi e titoli: data-indent="1…MAX_INDENT" (il rientro lo dà il CSS).
 * - Checklist (blocchi con data-check): data-indent, al massimo un livello più della riga sopra.
 * - Liste: Tab mette l'elemento in una sottolista dentro quello precedente; Shift+Tab lo porta
 *   dopo il genitore (i fratelli che seguono diventano suoi figli) e al primo livello lo fa
 *   tornare paragrafo.
 *
 * - Backspace all'inizio di una riga rientrata toglie un livello; Invio su una riga di checklist
 *   vuota esce dalla checklist.
 *
 * I nodi si spostano ma restano gli stessi: il cursore si rimette sugli stessi nodi.
 */

export const MAX_INDENT = 6;

const TEXT_TAGS = new Set(["P", "DIV", "H1", "H2", "H3"]);
const INLINE_TAGS = new Set(["SPAN", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "A", "BR", "FONT", "MARK", "SUB", "SUP", "CODE"]);

const isList = (n: Node | null): n is HTMLOListElement | HTMLUListElement =>
  n instanceof HTMLElement && (n.tagName === "UL" || n.tagName === "OL");

/** Livello di rientro di un blocco (0 = nessuno). */
export function indentLevel(el: Element): number {
  const n = Number(el.getAttribute("data-indent"));
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_INDENT) : 0;
}

function setLevel(el: HTMLElement, level: number) {
  if (level <= 0) el.removeAttribute("data-indent");
  else el.setAttribute("data-indent", String(Math.min(level, MAX_INDENT)));
}

/** Un blocco di testo della pagina (non immagine, file, tabella, linea). */
function isTextBlock(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && TEXT_TAGS.has(el.tagName) && !el.hasAttribute("data-block");
}

/** Testo "nudo" tra i figli della radice (senza paragrafo): si avvolge in un <p> per poterlo rientrare. */
function wrapLooseRuns(root: HTMLElement, range: Range) {
  let run: Node[] = [];
  const flush = () => {
    if (run.length > 0 && run.some((n) => range.intersectsNode(n))) {
      const p = document.createElement("p");
      run[0].parentNode!.insertBefore(p, run[0]);
      for (const n of run) p.appendChild(n);
    }
    run = [];
  };
  for (const node of Array.from(root.childNodes)) {
    const loose = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "").length > 0 : node instanceof HTMLElement && INLINE_TAGS.has(node.tagName);
    if (loose) run.push(node);
    else flush();
  }
  flush();
}

/** L'elemento di lista ha la selezione nel SUO testo (non solo in una sottolista). */
function ownsSelection(li: HTMLElement, range: Range): boolean {
  const own = Array.from(li.childNodes).filter((n) => !isList(n));
  if (own.length === 0) return range.intersectsNode(li);
  return own.some((n) => range.intersectsNode(n));
}

const BLOCK_CHILD = "ul, ol, li, p, div, h1, h2, h3, table, figure, hr, [data-block]";

/**
 * Chromium, trasformando in elenco una riga che è un <div>, lascia l'elenco DENTRO il <div>
 * (<div><ul>…</ul><br></div>): rientrare il <div> sposterebbe tutto l'elenco. Questi contenitori
 * si sciolgono: elenchi e blocchi tornano figli della pagina, il testo intorno resta in righe sue
 * (copie del contenitore, con i suoi attributi). I nodi di testo sono gli stessi: il cursore resta.
 */
function liftWrappedBlocks(root: HTMLElement, moved: Map<Node, Node>): boolean {
  let lifted = false;
  let changed = true;
  while (changed) {
    changed = false;
    for (const el of Array.from(root.children)) {
      if (!isTextBlock(el) || el.hasAttribute("data-check")) continue;
      if (!Array.from(el.children).some((c) => c.matches(BLOCK_CHILD))) continue;
      const parts: Node[] = [];
      let run: HTMLElement | null = null;
      for (const n of Array.from(el.childNodes)) {
        if (n instanceof HTMLElement && n.matches(BLOCK_CHILD)) {
          run = null;
          parts.push(n);
        } else if (run || !(n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() === "")) {
          if (!run) {
            run = el.cloneNode(false) as HTMLElement;
            parts.push(run);
          }
          run.appendChild(n);
        }
      }
      el.replaceWith(...parts);
      if (parts[0]) moved.set(el, parts[0]);
      changed = true;
      lifted = true;
    }
  }
  return lifted;
}

/**
 * Blocchi ed elementi di lista toccati dalla selezione, in ordine di documento: sempre il blocco
 * più interno (l'elemento di lista o la riga di testo), mai un contenitore.
 */
function targets(root: HTMLElement, range: Range): HTMLElement[] {
  const out: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>("li, p, div, h1, h2, h3").forEach((el) => {
    if (!range.intersectsNode(el)) return;
    // Niente dentro immagini/file (i loro controlli sono disegnati da React) o tabelle (hanno il loro Tab).
    if (el.closest("[data-block], table")) return;
    if (el.tagName === "LI") {
      if (ownsSelection(el, range)) out.push(el);
      return;
    }
    if (!isTextBlock(el) || el.parentElement?.closest("li")) return; // il testo di un elemento di lista va con lui
    if (Array.from(el.children).some((c) => c.matches(BLOCK_CHILD))) return; // contenitore
    out.push(el);
  });
  return out;
}

/** Profondità di una lista: 1 = al primo livello della pagina. */
function listDepth(root: HTMLElement, li: HTMLElement): number {
  let depth = 0;
  for (let n: HTMLElement | null = li.parentElement; n && n !== root; n = n.parentElement) if (isList(n)) depth++;
  return depth;
}

function indentItem(root: HTMLElement, li: HTMLElement): boolean {
  const list = li.parentElement;
  if (!isList(list) || listDepth(root, li) >= MAX_INDENT) return false; // al massimo MAX_INDENT livelli
  const prev = li.previousElementSibling;
  if (!prev) return false; // il primo elemento non ha sotto chi annidarsi
  if (isList(prev)) {
    // Lista annidata direttamente nella lista (HTML vecchio del browser): ci si aggiunge.
    prev.appendChild(li);
    return true;
  }
  const last = prev.lastElementChild;
  const sub = isList(last) ? last : prev.appendChild(document.createElement(list.tagName.toLowerCase()));
  sub.appendChild(li);
  return true;
}

function outdentItem(li: HTMLElement, moved: Map<Node, Node>): boolean {
  const list = li.parentElement;
  if (!isList(list)) return false;
  // I fratelli che seguono restano sotto l'elemento: diventano suoi figli.
  const following: Element[] = [];
  for (let n = li.nextElementSibling; n; n = n.nextElementSibling) following.push(n);
  const holder = list.parentElement;

  if (holder && (holder.tagName === "LI" || isList(holder))) {
    if (following.length > 0) {
      const last = li.lastElementChild;
      const sub = isList(last) ? last : li.appendChild(document.createElement(list.tagName.toLowerCase()));
      for (const n of following) sub.appendChild(n);
    }
    // Dentro un <li>: va dopo di lui. Lista annidata direttamente in una lista: va dopo la lista.
    if (holder.tagName === "LI") holder.after(li);
    else list.after(li);
    if (list.children.length === 0) list.remove();
    return true;
  }

  // Primo livello: l'elemento torna paragrafo e la lista si divide in due.
  const p = document.createElement("p");
  const subs: Element[] = [];
  for (const n of Array.from(li.childNodes)) {
    if (isList(n)) subs.push(n);
    else p.appendChild(n);
  }
  if (!p.hasChildNodes()) p.appendChild(document.createElement("br"));
  moved.set(li, p); // il cursore che stava nell'elemento vuoto va nel paragrafo
  let tail: Element | null = null;
  if (following.length > 0) {
    tail = document.createElement(list.tagName.toLowerCase());
    for (const n of following) tail.appendChild(n);
  }
  list.after(p);
  let anchor: Element = p;
  for (const s of subs) {
    anchor.after(s);
    anchor = s;
  }
  if (tail) anchor.after(tail);
  li.remove();
  if (list.children.length === 0) list.remove();
  return true;
}

function shiftBlock(block: HTMLElement, direction: 1 | -1): boolean {
  const level = indentLevel(block);
  let next = level + direction;
  if (direction > 0 && block.hasAttribute("data-check")) {
    // Una riga di checklist si annida solo sotto un'altra riga di checklist.
    const prev = block.previousElementSibling;
    const max = prev?.hasAttribute("data-check") ? indentLevel(prev) + 1 : 0;
    next = Math.min(next, max);
  }
  if (direction < 0 && level === 0 && block.hasAttribute("data-check")) {
    // Shift+Tab su una riga di checklist al primo livello: torna paragrafo (come gli elenchi).
    block.removeAttribute("data-check");
    return true;
  }
  next = Math.max(0, Math.min(MAX_INDENT, next));
  if (next === level) return false;
  setLevel(block, next);
  return true;
}

/** Un estremo della selezione: nodo e posizione (restano validi quando il nodo si sposta). */
interface Point {
  node: Node;
  offset: number;
}

/**
 * Un estremo che punta "tra i figli" di un elemento (es. cursore in una riga vuota) si porta
 * dentro il figlio: spostando o avvolgendo i figli gli indici cambierebbero.
 */
function pointOf(node: Node, offset: number): Point {
  // "Prima del figlio k" diventa "all'inizio del figlio k", finché il figlio può contenere il cursore.
  while (node.nodeType === Node.ELEMENT_NODE && offset < node.childNodes.length) {
    const child = node.childNodes[offset];
    if (child instanceof HTMLElement && /^(BR|HR|IMG)$/.test(child.tagName)) break;
    node = child;
    offset = 0;
  }
  return { node, offset };
}

function maxOffset(node: Node): number {
  return node.nodeType === Node.TEXT_NODE ? (node as Text).data.length : node.childNodes.length;
}

/**
 * Rimette la selezione sugli stessi nodi. NON si usa la posizione nel testo: una riga vuota non ha
 * testo e il cursore finirebbe alla fine della riga sopra. `moved` dice dove è finito un nodo tolto
 * (l'elemento di lista diventato paragrafo).
 */
function restore(root: HTMLElement, a: Point, b: Point, moved: Map<Node, Node>) {
  const fix = (p: Point): Point | null => {
    if (root.contains(p.node)) return { node: p.node, offset: Math.min(p.offset, maxOffset(p.node)) };
    const to = moved.get(p.node);
    return to && root.contains(to) ? { node: to, offset: 0 } : null;
  };
  const start = fix(a);
  const end = fix(b) ?? start;
  const sel = window.getSelection();
  if (!start || !end || !sel) return;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Rientra (1) o riduce (-1) i blocchi toccati dalla selezione. True se è cambiato qualcosa
 * (chi chiama salva: una voce sola nella cronologia).
 */
export function indentSelection(root: HTMLElement, direction: 1 | -1): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const first = sel.getRangeAt(0);
  if (!root.contains(first.commonAncestorContainer)) return false;
  const a = pointOf(first.startContainer, first.startOffset);
  const b = pointOf(first.endContainer, first.endOffset);
  const moved = new Map<Node, Node>();

  const lifted = liftWrappedBlocks(root, moved);
  restore(root, a, b, moved);
  if (sel.rangeCount === 0) return false;
  wrapLooseRuns(root, sel.getRangeAt(0));
  // Spostare i nodi può aver spostato anche la selezione: si rimette prima di leggere i blocchi.
  restore(root, a, b, moved);
  if (sel.rangeCount === 0) return false;
  const found = targets(root, sel.getRangeAt(0));
  // Un elemento si sposta con i suoi figli: un figlio selezionato insieme al genitore non si sposta due volte.
  const chosen = found.filter((el) => !found.some((other) => other !== el && other.tagName === "LI" && other.contains(el)));
  // Anche solo sciolto un contenitore l'HTML è cambiato: va salvato.
  let changed = lifted;
  for (const el of chosen) {
    if (el.tagName === "LI") changed = (direction > 0 ? indentItem(root, el) : outdentItem(el, moved)) || changed;
    else changed = shiftBlock(el, direction) || changed;
  }
  restore(root, a, b, moved);
  return changed;
}

/** Il blocco (paragrafo, checklist o elemento di lista) con il cursore all'inizio, se la selezione è vuota. */
function blockAtCaretStart(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const caret = sel.getRangeAt(0);
  let block: HTMLElement | null = null;
  for (let n: Node | null = caret.startContainer; n && n !== root; n = n.parentNode) {
    if (n instanceof HTMLElement && (n.tagName === "LI" || isTextBlock(n))) {
      block = n;
      break;
    }
  }
  if (!block) return null;
  const before = document.createRange();
  before.selectNodeContents(block);
  before.setEnd(caret.startContainer, caret.startOffset);
  return before.toString().length === 0 ? block : null;
}

/**
 * Backspace all'inizio di una riga rientrata (paragrafo, checklist o elemento di una sottolista):
 * toglie un livello invece di unire la riga a quella sopra. False = il tasto fa il suo solito lavoro.
 */
export function outdentAtCaretStart(root: HTMLElement): boolean {
  const block = blockAtCaretStart(root);
  if (!block) return false;
  if (block.tagName === "LI") {
    const holder = block.parentElement?.parentElement;
    if (!holder || holder === root) return false; // primo livello: decide il browser
  } else if (indentLevel(block) === 0) {
    return false;
  }
  return indentSelection(root, -1);
}

/**
 * Invio su una riga di checklist vuota: esce dalla checklist (prima toglie i livelli di rientro),
 * come negli altri editor. False = Invio normale.
 */
export function exitEmptyCheck(root: HTMLElement): boolean {
  const block = blockAtCaretStart(root);
  if (!block || !block.hasAttribute("data-check") || (block.textContent ?? "").trim() !== "") return false;
  if (indentLevel(block) > 0) setLevel(block, indentLevel(block) - 1);
  else block.removeAttribute("data-check");
  return true;
}
