/** Markdown semplice ⇄ HTML delle pagine. Copre solo ciò che l'editor sa produrre. */

import { asLangName } from "./codeLanguages";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMd(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/** Le celle di una riga GFM ("| a | b |"), con "\|" come barra vera. */
function tableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

const TABLE_SEP = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

/** Una tabella GFM (righe da `start`): l'HTML e quante righe ha usato, o null. */
function parseTable(lines: string[], start: number): { html: string; used: number } | null {
  const head = lines[start]?.trim() ?? "";
  const sep = lines[start + 1]?.trim() ?? "";
  if (!head.includes("|") || !TABLE_SEP.test(sep)) return null;
  const header = tableCells(head);
  const aligns = tableCells(sep).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : null));
  const width = header.length;
  const cell = (tag: string, text: string, i: number) => {
    const align = aligns[i] ? ` data-align="${aligns[i]}"` : "";
    const html = inlineMd(text).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
    return `<${tag}${align}>${html || "<br>"}</${tag}>`;
  };
  const row = (tag: string, cells: string[]) =>
    `<tr>${Array.from({ length: width }, (_, i) => cell(tag, cells[i] ?? "", i)).join("")}</tr>`;
  let used = 2;
  const body: string[] = [];
  while (start + used < lines.length && lines[start + used].includes("|") && lines[start + used].trim() !== "") {
    body.push(row("td", tableCells(lines[start + used])));
    used++;
  }
  // Intestazione tutta vuota = tabella senza intestazione (è così che la scrive l'esportazione).
  const thead = header.every((c) => c === "") ? "" : `<thead>${row("th", header)}</thead>`;
  return { html: `<table>${thead}<tbody>${body.join("")}</tbody></table>`, used };
}

interface ListItem {
  depth: number;
  tag: "ul" | "ol";
  html: string;
}

/** Elementi di lista con la loro profondità → <ul>/<ol> annidati (le sottoliste stanno dentro il <li>). */
function renderList(items: ListItem[]): string {
  let i = 0;
  const level = (d: number): string => {
    let out = "";
    let open: string | null = null;
    while (i < items.length && items[i].depth >= d) {
      const it = items[i];
      if (open !== it.tag) {
        if (open) out += `</${open}>`;
        out += `<${it.tag}>`;
        open = it.tag;
      }
      i++;
      out += `<li>${it.html}`;
      if (i < items.length && items[i].depth > d) out += level(d + 1);
      out += "</li>";
    }
    if (open) out += `</${open}>`;
    return out;
  };
  return level(0);
}

/** Spazi all'inizio della riga (una tabulazione vale 4). */
function leadingSpaces(line: string): number {
  const m = line.match(/^[ \t]*/)?.[0] ?? "";
  return m.replace(/\t/g, "    ").length;
}

const MAX_LEVEL = 6;

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let items: ListItem[] = [];
  /** Rientri (in spazi) dei livelli di lista aperti: decidono la profondità della riga dopo. */
  let indents: number[] = [];
  let para: string[] = [];
  let paraLevel = 0;

  const closeList = () => {
    if (items.length > 0) out.push(renderList(items));
    items = [];
    indents = [];
  };
  const flushPara = () => {
    if (para.length > 0) {
      const attr = paraLevel > 0 ? ` data-indent="${paraLevel}"` : "";
      out.push(`<p${attr}>${para.map(inlineMd).join("<br>")}</p>`);
    }
    para = [];
    paraLevel = 0;
  };
  const listDepth = (spaces: number): number => {
    while (indents.length > 0 && spaces < indents[indents.length - 1]) indents.pop();
    if (indents.length === 0 || spaces > indents[indents.length - 1]) indents.push(spaces);
    return Math.min(MAX_LEVEL, indents.length - 1);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    let m: RegExpMatchArray | null;
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w#+.-]*)\s*$/);
    if (fence) {
      // Blocco di codice: tutto fino al recinto di chiusura (stesso segno, almeno lungo uguale) è testo.
      flushPara();
      closeList();
      const mark = fence[1];
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const close = lines[j].trim();
        if (close.length >= mark.length && close === mark[0].repeat(close.length)) break;
        body.push(lines[j]);
      }
      const lang = asLangName(fence[2]);
      out.push(`<pre data-block="code" data-lang="${lang}"><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      i = j;
      continue;
    }
    const table = line.includes("|") ? parseTable(lines, i) : null;

    if (table) {
      flushPara();
      closeList();
      out.push(table.html);
      i += table.used - 1;
    } else if (line.trim() === "") {
      flushPara();
      closeList();
    } else if ((m = line.match(/^#\s+(.*)$/))) {
      flushPara();
      closeList();
      out.push(`<h1>${inlineMd(m[1])}</h1>`);
    } else if ((m = line.match(/^#{2,6}\s+(.*)$/))) {
      flushPara();
      closeList();
      out.push(`<h2>${inlineMd(m[1])}</h2>`);
    } else if ((m = line.match(/^[ \t]*[-*]\s+\[([ xX])\]\s*(.*)$/))) {
      // Checklist: 2 spazi di rientro = un livello (come la scrive l'esportazione).
      flushPara();
      closeList();
      const level = Math.min(MAX_LEVEL, Math.floor(leadingSpaces(line) / 2));
      const attr = level > 0 ? ` data-indent="${level}"` : "";
      out.push(`<p data-check="${m[1] === " " ? "0" : "1"}"${attr}>${inlineMd(m[2]) || "<br>"}</p>`);
    } else if ((m = line.match(/^[ \t]*(?:([-*])|\d+\.)\s+(.*)$/)) && !/^[ \t]*(-{3,}|\*{3,})$/.test(line)) {
      flushPara();
      items.push({ depth: listDepth(leadingSpaces(line)), tag: m[1] ? "ul" : "ol", html: inlineMd(m[2]) });
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushPara();
      closeList();
    } else {
      closeList();
      // Paragrafo rientrato: 2 "spazi em" (U+2003) per livello all'inizio, come lo scrive l'esportazione.
      const em = line.match(/^\u2003+/)?.[0].length ?? 0;
      if (para.length === 0) paraLevel = Math.min(MAX_LEVEL, Math.ceil(em / 2));
      para.push(em > 0 ? line.slice(em) : line);
    }
  }
  flushPara();
  closeList();
  return out.join("") || "<p><br></p>";
}

export function plainTextToHtml(text: string): string {
  const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n{2,}/).filter((p) => p.trim());
  return paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("") || "<p><br></p>";
}

export interface Frontmatter {
  meta: Record<string, string>;
  body: string;
}

/** Legge l'intestazione `---` in cima al file (solo righe `chiave: valore`). */
export function parseFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/\r\n?/g, "\n");
  const m = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: normalized };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: normalized.slice(m[0].length) };
}

export function parseMetaString(value: string | undefined): string | null {
  if (value === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

export function parseMetaTags(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}
