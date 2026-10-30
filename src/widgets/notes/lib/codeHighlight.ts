import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import type { CodeLang } from "./codeLanguages";

/**
 * Evidenziazione dei blocchi di codice. Il codice è SOLO testo: non viene mai eseguito né
 * interpretato come HTML.
 *
 * highlight.js restituisce una stringa HTML (testo già escapato + <span class="hljs-…">). Quella
 * stringa NON va mai in innerHTML: qui la si rilegge con un parser rigido che accetta solo
 * `<span class="…">` con classi di highlight.js, `</span>` e testo con le entità che
 * highlight.js usa per l'escape. Qualsiasi altra cosa → si ripiega sul testo semplice.
 * Dall'albero di token i componenti creano nodi con React o con createElement + textContent.
 * Logica pura (niente DOM): si prova con uno script .mts lanciato con node.
 */

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("python", python);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

/** Nome del linguaggio in highlight.js (HTML = "xml"); null = niente evidenziazione. */
const HLJS_NAME: Record<CodeLang, string | null> = {
  plaintext: null,
  python: "python",
  sql: "sql",
  java: "java",
  javascript: "javascript",
  typescript: "typescript",
  c: "c",
  cpp: "cpp",
  csharp: "csharp",
  html: "xml",
  css: "css",
  json: "json",
  bash: "bash",
  powershell: "powershell",
};

/** Un pezzo di codice: testo, o un gruppo con una classe di highlight.js. */
export type CodeToken = string | { cls: string; children: CodeToken[] };

/** Classi ammesse: solo quelle che highlight.js produce (hljs-keyword, "hljs-title function_", language-css). */
const CLASS_RE = /^(hljs-[a-z0-9_-]+|language-[a-z0-9]+)( [a-z0-9_-]+)*$/;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };

/**
 * Stringa di highlight.js → token. null se contiene qualcosa che non sia esattamente
 * span con classe, chiusura di span o testo con le entità note.
 */
export function parseHighlighted(html: string): CodeToken[] | null {
  const root: CodeToken[] = [];
  const stack: CodeToken[][] = [root];
  const re = /<span class="([^"<>]*)">|<\/span>|&[#a-z0-9]+;|[^<&]+|[<&]/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const piece = m[0];
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) {
      if (!CLASS_RE.test(m[1])) return null;
      const group = { cls: m[1], children: [] as CodeToken[] };
      top.push(group);
      stack.push(group.children);
    } else if (piece === "</span>") {
      if (stack.length === 1) return null;
      stack.pop();
    } else if (piece.startsWith("&") && piece.length > 1) {
      const ch = ENTITIES[piece.toLowerCase()];
      if (ch === undefined) return null;
      pushText(top, ch);
    } else if (piece === "<" || piece === "&") {
      return null; // un "<" o "&" nudo: highlight.js li escapa sempre, quindi qualcosa non va
    } else {
      pushText(top, piece);
    }
  }
  return stack.length === 1 ? root : null;
}

function pushText(list: CodeToken[], text: string) {
  const last = list[list.length - 1];
  if (typeof last === "string") list[list.length - 1] = last + text;
  else list.push(text);
}

/** Testo dei token (per controllare che non si perda nulla). */
export function tokensText(tokens: readonly CodeToken[]): string {
  return tokens.map((t) => (typeof t === "string" ? t : tokensText(t.children))).join("");
}

/** Codice → token evidenziati. Se qualcosa non torna, il codice intero come testo semplice. */
export function highlightCode(code: string, lang: CodeLang): CodeToken[] {
  const name = HLJS_NAME[lang];
  if (!name || code === "") return code === "" ? [] : [code];
  try {
    const tokens = parseHighlighted(hljs.highlight(code, { language: name, ignoreIllegals: true }).value);
    // Garanzia: i token contengono esattamente il codice, carattere per carattere.
    return tokens && tokensText(tokens) === code ? tokens : [code];
  } catch {
    return [code];
  }
}

/**
 * Token → nodi DOM sicuri (esportazione PDF/PNG): solo <span> con la classe e nodi di testo.
 * Nessun innerHTML.
 */
export function appendTokens(doc: Document, parent: Node, tokens: readonly CodeToken[]) {
  for (const t of tokens) {
    if (typeof t === "string") {
      parent.appendChild(doc.createTextNode(t));
    } else {
      const span = doc.createElement("span");
      span.className = t.cls;
      appendTokens(doc, span, t.children);
      parent.appendChild(span);
    }
  }
}
