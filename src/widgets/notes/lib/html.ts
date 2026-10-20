/**
 * Il contenuto delle pagine è HTML scritto in un contentEditable. Prima di
 * rimetterlo nel DOM (editor o anteprime) lo si ripulisce: restano solo i tag
 * di formattazione e due attributi (href sicuri e data-check delle checklist).
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script, style, iframe, object, embed, link, meta, form, img, video, audio, svg, input, button")
    .forEach((n) => n.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === "data-check" && (attr.value === "0" || attr.value === "1")) continue;
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
      case "UL":
        blocks.push(Array.from(node.children).map((li) => `- ${inline(li).trim()}`).join("\n"));
        break;
      case "OL":
        blocks.push(Array.from(node.children).map((li, i) => `${i + 1}. ${inline(li).trim()}`).join("\n"));
        break;
      default:
        if (node.hasAttribute("data-check")) blocks.push(`- [${node.getAttribute("data-check") === "1" ? "x" : " "}] ${text}`);
        else if (text) blocks.push(text);
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

export function monthYearUpper(ts: number): string {
  return new Date(ts).toLocaleDateString("it-IT", { month: "long", year: "numeric" }).toUpperCase();
}
