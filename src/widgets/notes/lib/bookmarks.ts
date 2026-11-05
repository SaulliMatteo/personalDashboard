/**
 * Segni (segnalibri) delle note.
 *
 * - Nel testo: <span data-bm="ID" data-bm-name="…" data-bm-kind="star" data-bm-color="rosso"></span>.
 *   L'HTML della pagina è l'UNICA fonte: nome, tipo e colore stanno sul marcatore, così annulla/ripeti,
 *   copia su disco e importazione li conservano da soli. Lo span è vuoto e non modificabile (il cursore
 *   lo salta come un carattere solo); l'icona la disegna il CSS.
 * - Sulla pagina (scrittura a mano): `pins` della pagina, coordinate come l'inchiostro (frazioni
 *   della larghezza della pagina, dall'origine dell'inchiostro).
 * - La tabella note_bookmarks è solo un indice per il pannello, ricalcolato a ogni salvataggio da
 *   `readBookmarks` (data/notesRepository.ts → savePage).
 *
 * La parte senza DOM (lettura dall'HTML, validazione, nomi, id) si prova con node
 * (scripts/notes/bookmarks.test.mts); le funzioni che usano il DOM lo toccano solo quando vengono chiamate.
 */

import { TEXT_COLORS } from "./textStyle";

export type BookmarkKind = "bookmark" | "star" | "important" | "question" | "review" | "todo";
export type BookmarkPlace = "testo" | "pagina";

/** Ordine dei pulsanti nel popover e dei filtri nel pannello. */
export const BOOKMARK_KINDS: readonly { key: BookmarkKind; label: string; glyph: string }[] = [
  { key: "bookmark", label: "Segnalibro", glyph: "🔖" },
  { key: "star", label: "Stella", glyph: "★" },
  { key: "important", label: "Importante", glyph: "!" },
  { key: "question", label: "Domanda", glyph: "?" },
  { key: "review", label: "Da rivedere", glyph: "↻" },
  { key: "todo", label: "Da fare", glyph: "✓" },
];

/** Colori già pronti: gli stessi del testo (token --nq-ink-<chiave>, uno per il giorno e uno per la notte). */
export const BOOKMARK_COLORS = TEXT_COLORS;

/** Carattere a larghezza zero: nei segni non va (il cursore ci restava dentro); dove c'è si toglie. */
export const MARKER_TEXT = "​";
export const MARKER_SELECTOR = "span[data-bm]";
export const NAME_MAX = 80;
const DEFAULT_NAME = "Segno";

export interface BookmarkData {
  id: string;
  name: string;
  kind: BookmarkKind;
  /** Chiave di BOOKMARK_COLORS, "#rrggbb" scelto dall'utente, o null = colore del tema. */
  color: string | null;
}

/** Segno appoggiato sulla pagina. */
export interface PagePin extends BookmarkData {
  x: number;
  y: number;
}

/** Una riga dell'indice: dove sta il segno nella pagina e com'è fatto. */
export interface BookmarkEntry extends BookmarkData {
  place: BookmarkPlace;
  /** Ordine nella pagina: prima i segni nel testo (ordine del testo), poi quelli sulla pagina (dall'alto). */
  position: number;
}

export type BookmarkPatch = Partial<Omit<BookmarkData, "id">>;

// ---------------------------------------------------------------------
// Validazione
// ---------------------------------------------------------------------

export function isBookmarkKind(value: unknown): value is BookmarkKind {
  return typeof value === "string" && BOOKMARK_KINDS.some((k) => k.key === value);
}

export function asBookmarkKind(value: unknown): BookmarkKind {
  return isBookmarkKind(value) ? value : "bookmark";
}

export function asBookmarkId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9]{8}$/.test(value) ? value : null;
}

/** Chiave della palette o "#rrggbb" (minuscolo); altrimenti null (colore del tema). */
export function asBookmarkColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (BOOKMARK_COLORS.some((c) => c.key === value)) return value;
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

/** Nome su una riga, senza spazi doppi, al massimo NAME_MAX caratteri. */
export function asBookmarkName(value: unknown): string {
  const chars = typeof value === "string" ? Array.from(value).map((c) => (c.charCodeAt(0) < 32 || c === MARKER_TEXT ? " " : c)) : [];
  const text = chars.join("").replace(/\s+/g, " ").trim();
  return text ? Array.from(text).slice(0, NAME_MAX).join("") : DEFAULT_NAME;
}

/** Valore da tenere per un attributo data-bm-* (sanitizeHtml), o null per toglierlo. */
export function markerAttr(name: string, value: string): string | null {
  switch (name) {
    case "data-bm":
      return asBookmarkId(value);
    case "data-bm-name":
      return asBookmarkName(value);
    case "data-bm-kind":
      return isBookmarkKind(value) ? value : null;
    case "data-bm-color":
      return asBookmarkColor(value);
    default:
      return null;
  }
}

function asCoord(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : null;
}

/** Segni della pagina letti dal DB o da canvas.json: tiene solo quelli validi (id ripetuti compresi). */
export function asPins(raw: unknown): PagePin[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PagePin[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const id = asBookmarkId(v.id);
    const x = asCoord(v.x, 1);
    const y = asCoord(v.y, 50);
    if (!id || seen.has(id) || x === null || y === null) continue;
    seen.add(id);
    out.push({ id, name: asBookmarkName(v.name), kind: asBookmarkKind(v.kind), color: asBookmarkColor(v.color), x, y });
  }
  return out;
}

export function parsePins(json: string | null | undefined): PagePin[] {
  try {
    return asPins(JSON.parse(json || "[]"));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------
// Id e nomi
// ---------------------------------------------------------------------

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Id nuovo di 8 caratteri; `random` iniettabile per le prove. */
export function newBookmarkId(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 8; i++) id += ID_CHARS[Math.floor(random() * ID_CHARS.length) % ID_CHARS.length];
  return id;
}

/** Nome proposto: le prime parole dopo il cursore, se no le ultime prima, se no "Segno". */
export function defaultBookmarkName(after: string, before: string, words = 5): string {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  after = after.replace(/​/g, "");
  before = before.replace(/​/g, "");
  // Segno in mezzo a una parola ("ri|empimento"): il nome comincia dall'inizio della parola.
  const head = /\S$/.test(before) && /^\S/.test(after) ? (before.match(/\S+$/)?.[0] ?? "") : "";
  const next = clean(head + after).split(" ").filter(Boolean).slice(0, words).join(" ");
  if (next) return asBookmarkName(next.slice(0, 40));
  const prev = clean(before).split(" ").filter(Boolean);
  const tail = prev.slice(Math.max(0, prev.length - words)).join(" ");
  return asBookmarkName(tail.slice(-40));
}

export function kindLabel(kind: BookmarkKind): string {
  return BOOKMARK_KINDS.find((k) => k.key === kind)?.label ?? "Segno";
}

export function kindGlyph(kind: BookmarkKind): string {
  return BOOKMARK_KINDS.find((k) => k.key === kind)?.glyph ?? "🔖";
}

// ---------------------------------------------------------------------
// Lettura dall'HTML salvato (senza DOM)
// ---------------------------------------------------------------------

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Apertura di uno span con i suoi attributi (i valori tra virgolette possono contenere ">"). */
const SPAN_RE = /<span\b((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/gi;
const ATTR_RE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function attributesOf(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of raw.matchAll(ATTR_RE)) map.set(m[1].toLowerCase(), decodeEntities(m[2] ?? m[3] ?? m[4] ?? ""));
  return map;
}

/** I segni nel testo, nell'ordine in cui compaiono (un id ripetuto vale una volta sola). */
export function readTextBookmarks(html: string): BookmarkData[] {
  if (!html.includes("data-bm")) return [];
  const out: BookmarkData[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(SPAN_RE)) {
    const attrs = attributesOf(m[1]);
    const id = asBookmarkId(attrs.get("data-bm"));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: asBookmarkName(attrs.get("data-bm-name")),
      kind: asBookmarkKind(attrs.get("data-bm-kind")),
      color: asBookmarkColor(attrs.get("data-bm-color")),
    });
  }
  return out;
}

/** Tutti i segni di una pagina, in ordine: quelli nel testo, poi quelli sulla pagina dall'alto. */
export function readBookmarks(html: string, pins: readonly PagePin[]): BookmarkEntry[] {
  const text = readTextBookmarks(html);
  const seen = new Set(text.map((b) => b.id));
  const onPage = [...pins].filter((p) => !seen.has(p.id)).sort((a, b) => a.y - b.y || a.x - b.x);
  return [
    ...text.map((b, i) => ({ ...b, place: "testo" as const, position: i })),
    ...onPage.map((p, i) => ({ id: p.id, name: p.name, kind: p.kind, color: p.color, place: "pagina" as const, position: text.length + i })),
  ];
}

// ---------------------------------------------------------------------
// Markdown (nota.md, Esporta, Copia)
// ---------------------------------------------------------------------

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Un segno nel testo in Markdown: un'ancora HTML invisibile, raggiungibile con #segno-ID. */
export function markerAnchor(b: Pick<BookmarkData, "id" | "name" | "kind">): string {
  return `<a id="segno-${b.id}" title="${escapeAttr(`${kindGlyph(b.kind)} ${b.name}`)}"></a>`;
}

/** I segni sulla pagina in Markdown: un commento per segno, in fondo alla pagina. */
export function pinsMarkdown(pins: readonly PagePin[]): string {
  return pins.map((p) => `<!-- segno: ${`${kindGlyph(p.kind)} ${p.name}`.replace(/--+/g, "–")} -->`).join("\n");
}

/** Riga di Markdown che è solo un commento di un segno sulla pagina (all'importazione si salta). */
export function isPinComment(line: string): boolean {
  return /^<!-- segno: .* -->$/.test(line.trim());
}

/**
 * Importazione da Markdown: le ancore scritte da markerAnchor tornano marcatori. Si sostituiscono
 * nel testo GREZZO (prima di escape e grassetto/corsivo, che non devono toccare il nome): `hold`
 * riceve l'HTML del marcatore e restituisce il segnaposto da mettere al suo posto.
 */
export function holdMarkerAnchors(raw: string, hold: (markerHtml: string) => string): string {
  return raw.replace(/<a id="segno-([a-z0-9]{8})" title="([^"]*)">\s*<\/a>/g, (_all, id: string, title: string) => {
    const full = decodeEntities(title);
    const kind = BOOKMARK_KINDS.find((k) => full.startsWith(`${k.glyph} `))?.key ?? "bookmark";
    const name = asBookmarkName(full.replace(/^\S+\s/, ""));
    return hold(`<span data-bm="${id}" data-bm-name="${escapeAttr(name)}" data-bm-kind="${kind}"></span>`);
  });
}

// ---------------------------------------------------------------------
// Copia e incolla dentro l'app
// ---------------------------------------------------------------------
// L'HTML incollato si ripulisce come quello di un'altra app (niente blocchi): per tenere i segni
// bisogna sapere che viene da una nota. L'ultima copia con dei segni si ricorda qui: se all'incolla
// il testo negli appunti è lo stesso, l'HTML è il nostro.

let lastCopy: { plain: string; html: string } | null = null;

export function rememberCopy(plain: string, html: string) {
  lastCopy = { plain, html };
}

/** L'HTML (con i segni) della nostra ultima copia, se il testo negli appunti è ancora quello. */
export function copiedHtmlFor(plain: string): string | null {
  return lastCopy && lastCopy.plain === plain ? lastCopy.html : null;
}

// ---------------------------------------------------------------------
// DOM (editor, pannello, esportazione)
// ---------------------------------------------------------------------

export function readMarker(el: HTMLElement): BookmarkData | null {
  const id = asBookmarkId(el.dataset.bm);
  if (!id) return null;
  return {
    id,
    name: asBookmarkName(el.dataset.bmName),
    kind: asBookmarkKind(el.dataset.bmKind),
    color: asBookmarkColor(el.dataset.bmColor),
  };
}

/** Il colore libero va in una variabile CSS (le chiavi della palette le colora il CSS). */
function paintMarker(el: HTMLElement, color: string | null) {
  if (color && color.startsWith("#")) el.style.setProperty("--nq-bm", color);
  else if (el.hasAttribute("style")) el.style.removeProperty("--nq-bm");
  if (el.hasAttribute("style") && el.style.length === 0) el.removeAttribute("style");
}

/** Scrive nome, tipo e colore sul marcatore (e il nome come suggerimento al passaggio). */
export function writeMarker(el: HTMLElement, data: Omit<BookmarkData, "id">) {
  el.dataset.bmName = asBookmarkName(data.name);
  el.dataset.bmKind = asBookmarkKind(data.kind);
  const color = asBookmarkColor(data.color);
  if (color) el.dataset.bmColor = color;
  else delete el.dataset.bmColor;
  el.title = `${kindLabel(asBookmarkKind(data.kind))}: ${el.dataset.bmName}`;
  paintMarker(el, color);
}

export function createMarker(data: BookmarkData): HTMLSpanElement {
  const el = document.createElement("span");
  el.dataset.bm = data.id;
  el.setAttribute("contenteditable", "false");
  // Vuoto: con del testo dentro il cursore ci entrerebbe e resterebbe bloccato.
  writeMarker(el, data);
  return el;
}

/**
 * Prepara i marcatori della pagina per l'editor: un pezzo unico nel testo, nome al passaggio,
 * colore libero. Un id ripetuto nella stessa pagina (blocco duplicato) ne riceve uno nuovo.
 */
export function prepareMarkers(root: HTMLElement, random: () => number = Math.random) {
  const seen = new Set<string>();
  root.querySelectorAll<HTMLElement>(MARKER_SELECTOR).forEach((el) => {
    const data = readMarker(el);
    if (!data) return;
    if (seen.has(data.id)) {
      data.id = newBookmarkId(random);
      el.dataset.bm = data.id;
    }
    seen.add(data.id);
    if (el.getAttribute("contenteditable") !== "false") el.setAttribute("contenteditable", "false");
    if (el.firstChild) el.textContent = "";
    const title = `${kindLabel(data.kind)}: ${data.name}`;
    if (el.title !== title) el.title = title;
    paintMarker(el, data.color);
  });
}

/** Marcatori incollati: ognuno diventa un segno nuovo (stesso nome, tipo e colore, id nuovo). */
export function freshMarkerIds(root: ParentNode, random: () => number = Math.random) {
  root.querySelectorAll<HTMLElement>(MARKER_SELECTOR).forEach((el) => {
    el.dataset.bm = newBookmarkId(random);
  });
}

/**
 * Rinomina, cambia o elimina un segno nell'HTML di una pagina non aperta nell'editor.
 * Restituisce null se il segno non è in quella pagina.
 */
export function editMarkerInHtml(html: string, id: string, change: BookmarkPatch | "delete"): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const el = doc.body.querySelector<HTMLElement>(`span[data-bm="${id}"]`);
  const data = el ? readMarker(el) : null;
  if (!el || !data) return null;
  if (change === "delete") el.remove();
  else {
    writeMarker(el, { ...data, ...change });
    el.removeAttribute("title");
    el.removeAttribute("style");
  }
  return doc.body.innerHTML;
}

/** Lo stesso sui segni della pagina; null se il segno non c'è. */
export function editPin(pins: readonly PagePin[], id: string, change: BookmarkPatch | "delete"): PagePin[] | null {
  if (!pins.some((p) => p.id === id)) return null;
  if (change === "delete") return pins.filter((p) => p.id !== id);
  return pins.map((p) =>
    p.id === id
      ? {
          ...p,
          name: change.name !== undefined ? asBookmarkName(change.name) : p.name,
          kind: change.kind !== undefined ? asBookmarkKind(change.kind) : p.kind,
          color: change.color !== undefined ? asBookmarkColor(change.color) : p.color,
        }
      : p
  );
}
