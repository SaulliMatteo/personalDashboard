/**
 * Stile del testo scelto dall'utente: font, dimensione, colore, evidenziatore.
 * Si scrive come <span data-font|data-size|data-color|data-mark="chiave">, mai come style libero:
 * così sanitizeHtml (lib/html.ts) può accettare solo i valori di questi elenchi, e i colori
 * vengono dai token (un valore per il giorno e uno per la notte).
 */

export const NOTE_FONTS = [
  { key: "sans", label: "Manrope" },
  { key: "grottesco", label: "Bricolage" },
  { key: "figtree", label: "Figtree" },
  { key: "serif", label: "Literata (serif)" },
  { key: "mano", label: "Caveat (a mano)" },
  { key: "mono", label: "JetBrains Mono" },
  { key: "punti", label: "Doto (a punti, solo titoli)" },
] as const;
export type NoteFont = (typeof NOTE_FONTS)[number]["key"];

/** Font che si possono scegliere come predefinito della nota (Doto solo nei titoli). */
export const NOTE_DEFAULT_FONTS = NOTE_FONTS.filter((f) => f.key !== "punti");

export const TEXT_COLORS = [
  { key: "rosso", label: "Rosso" },
  { key: "arancio", label: "Arancio" },
  { key: "verde", label: "Verde" },
  { key: "blu", label: "Blu" },
  { key: "viola", label: "Viola" },
  { key: "grigio", label: "Grigio" },
] as const;

export const MARK_COLORS = [
  { key: "giallo", label: "Giallo" },
  { key: "verde", label: "Verde" },
  { key: "azzurro", label: "Azzurro" },
  { key: "rosa", label: "Rosa" },
  { key: "arancio", label: "Arancio" },
  { key: "viola", label: "Viola" },
] as const;

/** "tema" = l'evidenziatore nel colore del tema (accent). */
export const MARK_THEME = "tema";

export const SIZE_MIN = 12;
export const SIZE_MAX = 40;
export const DEFAULT_SIZE = 15;

export type TextAttr = "data-font" | "data-size" | "data-color" | "data-mark";

const FONT_SET = new Set<string>(NOTE_FONTS.map((f) => f.key));
const COLOR_SET = new Set<string>(TEXT_COLORS.map((c) => c.key));
const MARK_SET = new Set<string>([...MARK_COLORS.map((c) => c.key), MARK_THEME]);

export function isNoteFont(value: unknown): value is NoteFont {
  return typeof value === "string" && FONT_SET.has(value);
}

/** Il valore va bene per quell'attributo? (usata da sanitizeHtml) */
export function validTextAttr(attr: string, value: string): boolean {
  switch (attr) {
    case "data-font":
      return FONT_SET.has(value);
    case "data-color":
      return COLOR_SET.has(value);
    case "data-mark":
      return MARK_SET.has(value);
    case "data-size": {
      const n = Number(value);
      return Number.isInteger(n) && n >= SIZE_MIN && n <= SIZE_MAX;
    }
    default:
      return false;
  }
}

const ZWSP = "​";
const TEMP_FACE = "nq-segnaposto";

function selectionIn(root: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? range : null;
}

/** Unisce uno span con il vicino uguale (stessi attributi), così l'HTML non si frammenta. */
function mergeWithSiblings(span: HTMLElement) {
  const same = (other: Node | null): other is HTMLElement =>
    other instanceof HTMLElement &&
    other.tagName === "SPAN" &&
    other.attributes.length === span.attributes.length &&
    Array.from(span.attributes).every((a) => other.getAttribute(a.name) === a.value);
  const prev = span.previousSibling;
  if (same(prev)) {
    while (span.firstChild) prev.appendChild(span.firstChild);
    span.remove();
    span = prev;
  }
  const next = span.nextSibling;
  if (same(next)) {
    while (next.firstChild) span.appendChild(next.firstChild);
    next.remove();
  }
}

/**
 * Applica (o toglie, con `value` null) un attributo di stile alla selezione.
 * Senza testo selezionato vale da qui in poi: si apre uno span vuoto col cursore dentro.
 * Con una selezione si usa il comando "fontName" del browser per spezzare bene i tag
 * tra più blocchi, poi il suo <font> segnaposto diventa lo span giusto.
 */
export function applyTextAttr(root: HTMLElement, attr: TextAttr, value: string | null): boolean {
  const range = selectionIn(root);
  if (!range) return false;
  const sel = window.getSelection();

  if (range.collapsed) {
    if (value === null) return false;
    const span = document.createElement("span");
    span.setAttribute(attr, value);
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

  document.execCommand("styleWithCSS", false, "false");
  document.execCommand("fontName", false, TEMP_FACE);
  const placed: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>(`font[face="${TEMP_FACE}"]`).forEach((font) => {
    // Dentro la selezione vince il valore nuovo: si toglie quello vecchio dai figli.
    font.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
      el.removeAttribute(attr);
      if (el.tagName === "SPAN" && el.attributes.length === 0) el.replaceWith(...Array.from(el.childNodes));
    });
    if (attr === "data-color") font.querySelectorAll<HTMLElement>("[style]").forEach((el) => el.style.removeProperty("color"));
    if (attr === "data-size") font.querySelectorAll<HTMLElement>("[style]").forEach((el) => el.style.removeProperty("font-size"));
    const children = Array.from(font.childNodes);
    if (value === null) {
      font.replaceWith(...children);
      return;
    }
    const span = document.createElement("span");
    span.setAttribute(attr, value);
    span.append(...children);
    font.replaceWith(span);
    placed.push(span);
  });
  if (placed.length > 0 && sel) {
    const again = document.createRange();
    again.setStartBefore(placed[0]);
    again.setEndAfter(placed[placed.length - 1]);
    sel.removeAllRanges();
    sel.addRange(again);
    for (const span of placed) if (span.isConnected) mergeWithSiblings(span);
  }
  return true;
}

/** Il valore dell'attributo sotto il cursore (il più vicino), o null. */
export function textAttrAt(root: HTMLElement, attr: TextAttr): string | null {
  const node = window.getSelection()?.anchorNode;
  if (!node || !root.contains(node)) return null;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  const owner = el?.closest(`[${attr}]`);
  return owner && root.contains(owner) ? owner.getAttribute(attr) : null;
}

/** Il cursore è in un titolo (h1–h3)? Il font "a punti" vale solo lì. */
export function inHeading(root: HTMLElement): boolean {
  const node = window.getSelection()?.anchorNode;
  if (!node || !root.contains(node)) return false;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  return !!el?.closest("h1, h2, h3");
}
