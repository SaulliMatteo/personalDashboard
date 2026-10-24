/** Markdown semplice ⇄ HTML delle pagine. Copre solo ciò che l'editor sa produrre. */

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

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];

  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const flushPara = () => {
    if (para.length > 0) out.push(`<p>${para.map(inlineMd).join("<br>")}</p>`);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    let m: RegExpMatchArray | null;
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
    } else if ((m = line.match(/^[-*]\s+\[([ xX])\]\s*(.*)$/))) {
      flushPara();
      closeList();
      out.push(`<p data-check="${m[1] === " " ? "0" : "1"}">${inlineMd(m[2]) || "<br>"}</p>`);
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      flushPara();
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inlineMd(m[1])}</li>`);
    } else if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      flushPara();
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inlineMd(m[1])}</li>`);
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushPara();
      closeList();
    } else {
      closeList();
      para.push(line);
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
