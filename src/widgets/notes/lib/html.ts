import { validTextAttr } from "./textStyle";
import { asAttachmentName, parseAlign, parseImageEdit, parseWidth, serializeImageEdit } from "./imageEdit";
import { asFreeCoord } from "./blocks";
import { asStrokes } from "./ink";
import { asLangName, langMarkdown } from "./codeLanguages";
import { asCellAlign, asCellWidth, readTable } from "./tableDom";
import { MAX_SPAN, asBorderStyle, asBorderWidth, asFillColor, asInkColor, tableToMarkdown } from "./tables";

/**
 * Il contenuto delle pagine è HTML scritto in un contentEditable. Prima di
 * rimetterlo nel DOM (editor o anteprime) lo si ripulisce: restano solo i tag
 * di formattazione e pochi attributi (href sicuri, data-check delle checklist, data-indent 1…6,
 * data-font/size/color/mark con i valori di lib/textStyle.ts, colspan/rowspan e
 * data-align/data-width delle celle di tabella).
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
const asId = (value: string) => (/^\d{1,12}$/.test(value) && Number(value) > 0 ? String(Number(value)) : null);

function blockAttr(el: Element, name: string, value: string): string | null {
  const kind = el.getAttribute("data-block");
  if (name === "data-block") return value;
  if (kind === "collection-view") return name === "data-view" ? asId(value) : null;
  if (kind === "code") {
    if (name === "data-lang") return asLangName(value);
    if (name === "data-lines") return value === "1" ? "1" : null;
    return null;
  }
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

/** Un blocco vero: figure immagine o div file con il nome del file valido, o vista collegata. */
function isValidBlock(el: Element): boolean {
  const kind = el.getAttribute("data-block");
  if (kind === "code") return el.tagName === "PRE";
  if (kind === "collection-view") return el.tagName === "DIV" && asId(el.getAttribute("data-view") ?? "") !== null;
  const okTag = (kind === "image" && el.tagName === "FIGURE") || (kind === "file" && el.tagName === "DIV");
  return okTag && asAttachmentName(el.getAttribute("data-attachment")) !== null;
}

/** Attributi delle celle di tabella (lib/tableDom.ts): il valore da tenere, o null. */
function cellAttr(name: string, value: string): string | null {
  if (name === "colspan" || name === "rowspan") {
    const n = Number(value);
    return Number.isInteger(n) && n > 1 && n <= MAX_SPAN ? String(n) : null;
  }
  if (name === "data-align") return asCellAlign(value);
  if (name === "data-width") return asCellWidth(value)?.toString() ?? null;
  if (name === "data-bg") return asFillColor(value);
  return null;
}

/** Aspetto della tabella (bordi, intestazione): il valore da tenere, o null. */
function tableAttr(name: string, value: string): string | null {
  if (name === "data-border-color" || name === "data-head-color") return asInkColor(value);
  if (name === "data-border-width") return asBorderWidth(value);
  if (name === "data-border-style") return asBorderStyle(value);
  return null;
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
    .querySelectorAll(
      "script, style, iframe, frame, frameset, object, embed, applet, portal, link, meta, base, form, img, video, audio, svg, math, input, button, textarea, select, template, noscript, noembed, noframes, xmp, plaintext, title, colgroup, col, [data-runtime]"
    )
    .forEach((n) => n.remove());
  // Niente tabelle dentro le celle: quella interna diventa testo.
  doc.body.querySelectorAll("td table, th table").forEach((t) => t.replaceWith(doc.createTextNode(t.textContent ?? "")));
  // Blocchi di codice: il codice è SOLO testo. Il blocco si ricostruisce da zero con un solo <code>
  // e il testo (textContent): qualunque tag o attributo ci fosse dentro sparisce. Un <pre> arrivato
  // da un'altra app (incolla) diventa un blocco di codice; il linguaggio dalla classe language-xxx.
  doc.body.querySelectorAll("pre").forEach((pre) => {
    const ours = pre.getAttribute("data-block") === "code";
    if (!ours && !external) return;
    const classes = `${pre.className} ${pre.querySelector("code")?.className ?? ""}`;
    const hint = classes.match(/(?:^|\s)(?:language|lang)-([\w#+-]+)/i)?.[1];
    const lang = asLangName(ours ? pre.getAttribute("data-lang") : hint);
    const lines = ours && pre.getAttribute("data-lines") === "1";
    const text = pre.textContent ?? "";
    const block = doc.createElement("pre");
    block.setAttribute("data-block", "code");
    block.setAttribute("data-lang", lang);
    if (lines) block.setAttribute("data-lines", "1");
    const code = doc.createElement("code");
    code.textContent = text;
    block.appendChild(code);
    pre.replaceWith(block);
  });
  doc.body.querySelectorAll("[data-block]").forEach((el) => {
    // Un blocco non valido o arrivato da fuori diventa un elemento normale (le didascalie restano testo).
    // Il codice no: è solo testo e non rimanda a file della nota.
    const code = el.getAttribute("data-block") === "code" && isValidBlock(el);
    if ((external && !code) || !isValidBlock(el)) el.removeAttribute("data-block");
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
      // Rientro (lib/indent.ts): solo livelli 1…6 e solo sui blocchi di testo.
      if (name === "data-indent" && !isBlock && /^[1-6]$/.test(attr.value) && /^(P|DIV|H1|H2|H3)$/.test(el.tagName)) continue;
      if (el.tagName === "SPAN" && validTextAttr(name, attr.value)) continue;
      if (el.tagName === "SPAN" && name === "data-ref-row" && !external && asId(attr.value) !== null) continue;
      if (el.tagName === "TD" || el.tagName === "TH" || el.tagName === "TABLE") {
        const kept = el.tagName === "TABLE" ? tableAttr(name, attr.value) : cellAttr(name, attr.value);
        if (kept !== null) {
          if (kept !== attr.value) el.setAttribute(attr.name, kept);
          continue;
        }
      }
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
    .replace(/<\/(p|div|h[1-6]|li|td|th|tr)>/gi, " ")
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

  /** Una cella in Markdown: il suo contenuto in linea (i blocchi interni vanno a capo). */
  const cellMarkdown = (html: string): string => {
    const box = doc.createElement("div");
    box.innerHTML = html;
    const parts = Array.from(box.childNodes).map((n) => inline(n).trim());
    return parts.filter(Boolean).join("\n");
  };

  /**
   * Lista (anche annidata) in righe Markdown: ogni sottolista rientra quanto il segno del suo
   * genitore ("- " = 2 spazi, "12. " = 4), così i lettori Markdown la annidano.
   */
  const listMarkdown = (list: Element, pad: string): string[] => {
    const lines: string[] = [];
    const ordered = list.tagName === "OL";
    let n = 0;
    for (const child of Array.from(list.children)) {
      if (child.tagName === "UL" || child.tagName === "OL") {
        // Lista annidata direttamente nella lista (HTML vecchio del browser).
        lines.push(...listMarkdown(child, `${pad}  `));
        continue;
      }
      if (child.tagName !== "LI") continue;
      n++;
      const marker = ordered ? `${n}. ` : "- ";
      const own = Array.from(child.childNodes)
        .filter((c) => !(c instanceof HTMLElement && (c.tagName === "UL" || c.tagName === "OL")))
        .map(inline)
        .join("")
        .trim();
      lines.push(`${pad}${marker}${own}`);
      for (const sub of Array.from(child.children)) {
        if (sub.tagName === "UL" || sub.tagName === "OL") lines.push(...listMarkdown(sub, pad + " ".repeat(marker.length)));
      }
    }
    return lines;
  };

  const level = (el: Element) => {
    const n = Number(el.getAttribute("data-indent"));
    return Number.isInteger(n) && n > 0 ? Math.min(n, 6) : 0;
  };

  const blocks: string[] = [];
  /** Righe di checklist consecutive: una lista sola (le annidate rientrano di 2 spazi per livello). */
  let checks: string[] | null = null;
  for (const node of Array.from(doc.body.childNodes)) {
    if (!(node instanceof HTMLElement)) {
      const t = (node.textContent ?? "").trim();
      if (t) {
        checks = null;
        blocks.push(t);
      }
      continue;
    }
    if (node.hasAttribute("data-check") && !node.getAttribute("data-block")) {
      const line = `${"  ".repeat(level(node))}- [${node.getAttribute("data-check") === "1" ? "x" : " "}] ${inline(node).trim()}`;
      if (checks) checks.push(line);
      else {
        checks = [line];
        blocks.push("");
      }
      blocks[blocks.length - 1] = checks.join("\n");
      continue;
    }
    checks = null;
    if (node.tagName === "PRE" && node.getAttribute("data-block") === "code") {
      // Recinto più lungo di qualsiasi fila di ` nel codice, così il codice non lo chiude.
      const code = node.querySelector("code")?.textContent ?? node.textContent ?? "";
      const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((r) => r.length));
      const fence = "`".repeat(Math.max(3, longest + 1));
      blocks.push(`${fence}${langMarkdown(asLangName(node.getAttribute("data-lang")))}\n${code.replace(/\n$/, "")}\n${fence}`);
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
      case "TABLE":
        blocks.push(tableToMarkdown(readTable(node as HTMLTableElement).model, cellMarkdown));
        break;
      case "UL":
      case "OL":
        blocks.push(listMarkdown(node, "").join("\n"));
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
        // Paragrafo rientrato: 2 "spazi em" (U+2003) per livello, invisibili nel testo grezzo
        // (4 spazi normali lo farebbero diventare codice). L'importazione li rilegge come livello.
        if (text) blocks.push(`${"\u2003\u2003".repeat(level(node))}${text}`);
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
