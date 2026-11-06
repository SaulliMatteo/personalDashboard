import { useRef, useState, type PointerEvent, type RefObject } from "react";
import { LINK_SELECTOR, PDF_LINK_SELECTOR } from "../lib/bookmarks";
import { caretAt } from "../lib/blocks";

/** Pixel da percorrere prima che la pressione diventi un trascinamento (sotto è un clic). */
const DRAG_THRESHOLD = 5;
/** Vicino al bordo del riquadro che scorre, la pagina scorre da sola. */
const EDGE = 48;
const EDGE_SPEED = 14;

/** Dove andrà il collegamento: una barretta come il cursore del testo. */
export interface DropCaret {
  x: number;
  y: number;
  h: number;
}

/** Il punto del testo sotto il puntatore, se lì il collegamento può stare (non nei blocchi né nelle didascalie). */
function dropRange(root: HTMLElement, x: number, y: number): Range | null {
  const range = caretAt(root, x, y);
  if (!range) return null;
  const node = range.startContainer;
  const el = node instanceof Element ? node : node.parentElement;
  if (!el || el.closest("[data-block], figcaption") || el.closest(LINK_SELECTOR)) return null;
  return range;
}

function caretBox(range: Range): DropCaret | null {
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  if (rect.height > 0) return { x: rect.left, y: rect.top, h: rect.height };
  // Riga vuota: il rettangolo del punto è nullo, si usa quello della riga.
  const node = range.startContainer;
  const el = node instanceof Element ? node : node.parentElement;
  if (!el) return null;
  const line = el.getBoundingClientRect();
  const h = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5 || 20;
  return { x: line.left, y: line.top, h };
}

/**
 * Spostare un collegamento a un PDF trascinandolo nel testo. Col puntatore e non col trascinamento
 * nativo, che in Tauri porta i file da fuori (e aprirebbe la scelta "allega / inserisci").
 * `onMoved` salva la pagina: lo spostamento è una modifica normale, Ctrl+Z la annulla.
 */
export function usePdfLinkDrag(editorRef: RefObject<HTMLDivElement | null>, enabled: boolean, onMoved: () => void) {
  const [caret, setCaret] = useState<DropCaret | null>(null);
  /** Il clic che il browser manda dopo un trascinamento non deve aprire il PDF. */
  const swallowClick = useRef(false);

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    if (!enabled || e.button !== 0) return;
    const root = editorRef.current;
    const found = (e.target as HTMLElement).closest<HTMLElement>(PDF_LINK_SELECTOR);
    if (!root || !found || !root.contains(found)) return;
    const link: HTMLElement = found;
    // Niente selezione del testo mentre si trascina (il clic arriva comunque).
    e.preventDefault();
    swallowClick.current = false;
    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    const scroller = root.closest<HTMLElement>(".nq-scroll");
    let dragging = false;
    let lastX = startX;
    let lastY = startY;
    let timer = 0;

    const update = () => {
      const range = dropRange(root, lastX, lastY);
      setCaret(range ? caretBox(range) : null);
    };

    const edgeScroll = () => {
      if (!scroller) return;
      const box = scroller.getBoundingClientRect();
      const dy = lastY < box.top + EDGE ? -EDGE_SPEED : lastY > box.bottom - EDGE ? EDGE_SPEED : 0;
      if (dy) {
        scroller.scrollBy(0, dy);
        update();
      }
    };

    const finish = (drop: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.clearInterval(timer);
      if (link.hasPointerCapture(pointerId)) link.releasePointerCapture(pointerId);
      link.removeAttribute("data-dragging");
      setCaret(null);
      if (!dragging) return;
      swallowClick.current = true;
      window.setTimeout(() => (swallowClick.current = false), 100);
      const range = drop ? dropRange(root, lastX, lastY) : null;
      if (!range) return;
      range.collapse(true);
      range.insertNode(link);
      const after = document.createRange();
      after.setStartAfter(link);
      after.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(after);
      root.focus({ preventScroll: true });
      onMoved();
    };

    function onMove(ev: globalThis.PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!dragging) {
        if (Math.hypot(lastX - startX, lastY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        // Con la cattura il cursore "afferra" resta anche fuori dal collegamento.
        link.setPointerCapture(pointerId);
        link.setAttribute("data-dragging", "");
        timer = window.setInterval(edgeScroll, 16);
      }
      update();
    }
    function onUp(ev: globalThis.PointerEvent) {
      if (ev.pointerId === pointerId) finish(true);
    }
    function onCancel(ev: globalThis.PointerEvent) {
      if (ev.pointerId === pointerId) finish(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== "Escape" || !dragging) return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  }

  /** true (una volta sola) se il clic appena arrivato chiude un trascinamento. */
  function consumeClick(): boolean {
    if (!swallowClick.current) return false;
    swallowClick.current = false;
    return true;
  }

  return { caret, onPointerDown, consumeClick };
}
