import { validTextAttr } from "./textStyle";
import { asAttachmentName, parseAlign, parseImageEdit, parseWidth, serializeImageEdit } from "./imageEdit";
import { asFreeCoord } from "./blocks";
import { asStrokes } from "./ink";

/**
 * Il contenuto delle pagine è HTML scritto in un contentEditable. Prima di
 * rimetterlo nel DOM (editor o anteprime) lo si ripulisce: restano solo i tag
 * di formattazione e pochi attributi (href sicuri, data-check delle checklist,
 * data-font/size/color/mark con i valori di lib/textStyle.ts).
 */
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}(\s*,\s*\d{1,3}){2}(\s*,\s*[\d.]+)?\s*\)|[a-z]+)$/i;
const SIZE_RE = /^(\d+(\.\d+)?px|calc\(\s*\d+(\.\d+)?\s*\*\s*var\(--nq-px\)\s*\))$/;

/** Dello style resta solo ciò che l'editor sa produrre: colore, sfondo del testo e dimensione. */
function safeStyle(css: string): string {
  const out: string[] = [];
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if ((prop === "color" || prop === "background-color") && COLOR_RE.test(value)) out.push(`${prop}: ${value}`);
    else if (prop === "font-size" && SIZE_RE.test(value)) out.push(`font-size: ${value}`);
  }
  return out.join("; ");
}

/**
 * Attributi dei blocchi immagine/file (lib/blocks.ts), ripuliti: il valore normalizzato da tenere,
 * oppure null per toglierlo.
 */
function blockAttr(el: Element, name: string, value: string): string | null {
  const kind = el.getAttribute("data-block");
  if (name === "data-block") return value;
  if (name === "data-attachment") return asAttachmentName(value);
  if (kind === "image" && el.tagName === "FIGURE") {
    if (name === "data-edit") return serializeImageEdit(parseImageEdit(value));
    if (name === "data-align") return parseAlign(value) === value ? value : null;
    if (name === "data-width") return parseWidth(value)?.toString() ?? null;
    if (name === "data-x" || name === "data-y") return asFreeCoord(name, value);
    if (name === "data-ink") {
      try {
        const strokes = asStrokes(JSON.parse(value));
        return strokes.length > 0 ? JSON.stringify(strokes) : null;
      } catch {
        return null;
      }
    }
  }
  if (kind === "file" && el.tagName === "DIV" && name === "data-bytes") {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? String(n) : null;
  }
  return null;
}

/** Un blocco vero: figure immagine o div file, con il nome del file valido. */
function isValidBlock(el: Element): boolean {
  const kind = el.getAttribute("data-block");
  const okTag = (kind === "image" && el.tagName === "FIGURE") || (kind === "file" && el.tagName === "DIV");
  return okTag && asAttachmentName(el.getAttribute("data-attachment")) !== null;
}

export interface SanitizeOptions {
  /** "esterno" = HTML incollato da un'altra app: niente blocchi (riferimenti a file della nota). */
  source?: "app" | "esterno";
}

export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  if (!html) return "";
  const external = options.source === "esterno";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script, style, iframe, object, embed, link, meta, form, img, video, audio, svg, input, button, [data-runtime]")
    .forEach((n) => n.remove());
  doc.body.querySelectorAll("[data-block]").forEach((el) => {
    // Un blocco non valido o arrivato da fuori diventa un elemento normale (le didascalie restano testo).
    if (external || !isValidBlock(el)) el.removeAttribute("data-block");
  });
  doc.body.querySelectorAll("*").forEach((el) => {
    const isBlock = el.hasAttribute("data-block");
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === "style") {
        const safe = safeStyle(attr.value);
        if (safe) el.setAttribute("style", safe);
        else el.removeAttribute("style");
        continue;
      }
      if (name === "data-check" && (attr.value === "0" || attr.value === "1")) continue;
      if (el.tagName === "SPAN" && validTextAttr(name, attr.value)) continue;
      if (isBlock && name.startsWith("data-")) {
        const kept = blockAttr(el, name, attr.value);
        if (kept !== null) {
          if (kept !== attr.value) el.setAttribute(attr.name, kept);
          continue;
        }
      }
      if (name === "href" && el.tagName === "A" && /^(https?:|mailto:)/i.test(attr.value.trim())) continue;
      el.removeAttribute(attr.name);
    }
    if (el.tagName === "A") el.setAttribute("rel", "noreferrer");
  });
  return doc.body.innerHTML;
}

/** Testo semplice (senza DOM: veloce anche chiamato a ogni tasto). */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(html: string): number {
  const text = htmlToText(html);
  return text ? text.split(" ").length : 0;
}

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), "text/html");

  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    const inner = Array.from(node.childNodes).map(inline).join("");
    switch (node.tagName) {
      case "B":
      case "STRONG":
        return `**${inner}**`;
      case "I":
      case "EM":
        return `*${inner}*`;
      case "S":
      case "STRIKE":
      case "DEL":
        return `~~${inner}~~`;
      case "A":
        return `[${inner}](${node.getAttribute("href") ?? ""})`;
      case "BR":
        return "\n";
      default:
        return inner;
    }
  };

  const blocks: string[] = [];
  for (const node of Array.from(doc.body.childNodes)) {
    if (!(node instanceof HTMLElement)) {
      const t = (node.textContent ?? "").trim();
      if (t) blocks.push(t);
      continue;
    }
    const text = inline(node).trim();
    switch (node.tagName) {
      case "H1":
        blocks.push(`# ${text}`);
        break;
      case "H2":
        blocks.push(`## ${text}`);
        break;
      case "H3":
        blocks.push(`### ${text}`);
        break;
      case "HR":
        blocks.push("---");
        break;
      case "UL":
        blocks.push(Array.from(node.children).map((li) => `- ${inline(li).trim()}`).join("\n"));
        break;
      case "OL":
        blocks.push(Array.from(node.children).map((li, i) => `${i + 1}. ${inline(li).trim()}`).join("\n"));
        break;
      default: {
        // Blocchi della pagina: rimandano al file in allegati/, accanto a nota.md.
        const block = node.getAttribute("data-block");
        const file = node.getAttribute("data-attachment");
        if (block && file) {
          const caption = node.querySelector("figcaption")?.textContent?.trim();
          blocks.push(block === "image" ? `![${caption || file}](<allegati/${file}>)` : `[${file}](<allegati/${file}>)`);
          break;
        }
        if (node.hasAttribute("data-check")) blocks.push(`- [${node.getAttribute("data-check") === "1" ? "x" : " "}] ${text}`);
        else if (text) blocks.push(text);
      }
    }
  }
  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function shortDate(d: Date): string {
  return `${d.getDate()} ${d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}`;
}

/** "Oggi, 14:32" · "Ieri, 17:45" · "13 ott, 16:20" */
export function formatWhen(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const today = startOfToday();
  if (ts >= today) return `Oggi, ${time}`;
  if (ts >= today - DAY_MS) return `Ieri, ${time}`;
  return `${shortDate(d)}, ${time}`;
}

/** "adesso" · "5 min fa" · "2 ore fa" · "ieri" · "lunedì" · "13 ott": quando, a colpo d'occhio. */
export function relativeWhen(ts: number, now = Date.now()): string {
  const minutes = Math.floor((now - ts) / 60000);
  const today = startOfToday();
  if (ts >= today) {
    if (minutes < 1) return "adesso";
    if (minutes < 60) return `${minutes} min fa`;
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? "1 ora fa" : `${hours} ore fa`;
  }
  if (ts >= today - DAY_MS) return "ieri";
  if (ts >= today - 6 * DAY_MS) return new Date(ts).toLocaleDateString("it-IT", { weekday: "long" });
  return shortDate(new Date(ts));
}

/** "oggi" · "ieri" · "il 13 ott" */
export function relativeDay(ts: number): string {
  const today = startOfToday();
  if (ts >= today) return "oggi";
  if (ts >= today - DAY_MS) return "ieri";
  return `il ${shortDate(new Date(ts))}`;
}

/** "Ottobre 2026". */
export function monthYear(ts: number): string {
  const text = new Date(ts).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "OTTOBRE 2026" (intestazione delle note esportate). */
export function monthYearUpper(ts: number): string {
  return new Date(ts).toLocaleDateString("it-IT", { month: "long", year: "numeric" }).toUpperCase();
}
