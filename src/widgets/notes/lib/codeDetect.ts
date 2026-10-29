import type { CodeLang } from "./codeLanguages";

/**
 * "Questo testo incollato è codice? In che linguaggio?" Logica PURA a euristiche (niente DOM,
 * soglie iniettabili): si prova con uno script .mts lanciato con node.
 *
 * Il punteggio mette insieme: forma del testo (righe che finiscono con ; { } :, indentazione,
 * densità di simboli), parole chiave tipiche di ogni linguaggio e quanto somiglia alla prosa
 * (parole comuni, frasi con il punto), che pesa contro.
 */

export type CodeConfidence = "alta" | "media" | "nessuna";

export interface CodeGuess {
  lang: CodeLang;
  /** 0..1 */
  score: number;
  level: CodeConfidence;
}

export interface DetectOptions {
  /** Linguaggio già noto (es. dai dati di VS Code negli appunti). */
  hint?: CodeLang | null;
  /** Soglie del punteggio per "alta" e "media". */
  high?: number;
  medium?: number;
}

type Rule = [RegExp, number];

/** Indizi per linguaggio: espressione e peso (le /g contano le volte, fino a 3). */
const RULES: Record<Exclude<CodeLang, "plaintext" | "typescript">, Rule[]> = {
  python: [
    [/^\s*def \w+\s*\(.*\)\s*(->\s*[\w[\], ]+)?:\s*$/m, 3],
    [/^\s*(import [\w.]+(\s+as \w+)?|from [\w.]+ import .+)$/m, 2.5],
    [/^\s*(if|elif|else|for|while|with|try|except|finally|class)\b.*:\s*$/gm, 1.2],
    [/\bself\b/, 1.5],
    [/\bprint\(/, 1],
    [/\b(None|True|False)\b/, 1],
    [/^\s*@\w+/m, 0.5],
  ],
  sql: [
    [/\bSELECT\b[\s\S]+?\bFROM\b/i, 4],
    [/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW)|ALTER\s+TABLE|DROP\s+TABLE)\b/i, 4],
    [/\b(WHERE|JOIN|GROUP BY|ORDER BY|VALUES|PRIMARY KEY)\b/g, 1],
  ],
  java: [
    [/\bpublic\s+(static\s+)?(final\s+)?(class|interface|enum|void)\b/, 2.5],
    [/System\.out\.print/, 3.5],
    [/^\s*import java\./m, 4],
    [/@Override\b/, 2],
    [/\bString\[\]\s+args\b/, 3],
    [/\b(private|protected)\s+[\w<>[\]]+\s+\w+\s*[;=(]/, 1.5],
  ],
  csharp: [
    [/^\s*using System(\.\w+)*;/m, 4],
    [/\bnamespace\s+[\w.]+/, 2],
    [/\bConsole\.Write(Line)?\(/, 3.5],
    [/\{\s*get;\s*(set;)?\s*\}/, 3],
    [/\bpublic\s+(static\s+)?(class|void|async)\b/, 1],
    [/\bvar\s+\w+\s*=/, 0.5],
  ],
  c: [
    [/^\s*#include\s*<\w+\.h>/m, 4],
    [/\bprintf\s*\(/, 2],
    [/\bint\s+main\s*\(/, 2],
    [/\b(malloc|free|sizeof|scanf)\s*\(/, 1.5],
  ],
  cpp: [
    [/^\s*#include\s*<(iostream|vector|string|map|memory|algorithm|unordered_map|set)>/m, 4.5],
    [/\bstd::/, 3],
    [/\b(cout|cin)\s*(<<|>>)/, 3],
    [/\btemplate\s*</, 2],
    [/\busing namespace std\b/, 3],
  ],
  javascript: [
    [/\b(const|let)\s+\w+\s*=/g, 1.2],
    [/\bfunction\s*\w*\s*\(/, 2],
    [/=>/, 1.5],
    [/\bconsole\.(log|error|warn)\(/, 3],
    [/\b(document|window)\.\w+/, 2],
    [/\b(require\(|module\.exports|export\s+(default|const|function|class)|import\s+.+\s+from\s+["'])/, 2],
    [/===|!==/, 1],
  ],
  html: [
    [/<!DOCTYPE html>/i, 5],
    [/<\/?(html|head|body|div|span|p|a|ul|ol|li|script|style|section|header|footer|nav|button|input|form|img|table|tr|td|h[1-6])\b[^>]*>/gi, 1.6],
    [/<\/[a-z][\w-]*>/i, 1],
  ],
  css: [
    [/^\s*(@media|@import|@font-face|@keyframes)\b/m, 3],
    [/^\s*[.#]?[a-z][\w-]*(\s*[,>+~ ]\s*[.#:]?[\w-]+)*\s*\{\s*$/gim, 1.5],
    [/^\s*[a-z-]+\s*:\s*[^;{}]+;\s*$/gm, 1.2],
    [/!important|:hover|:root\b/, 1.5],
  ],
  json: [],
  bash: [
    [/^#!\/(usr\/)?bin\/(env\s+)?(ba|z)?sh/m, 5],
    [/^\s*(sudo|apt|apt-get|npm|npx|yarn|git|cd|ls|echo|export|chmod|mkdir|rm|cp|mv|curl|wget|pip|brew|cargo|docker)\s/gm, 1.5],
    [/^\s*(if \[|then|fi|for \w+ in|do|done|case .+ in|esac)\b/m, 2],
    [/\$\{?\w+\}?/, 0.6],
    [/^\s*\$ \w/m, 2],
  ],
  powershell: [
    [/\b(Get|Set|New|Remove|Write|Start|Stop|Invoke|Test|Import|Export|Select|Where|ForEach|Add|Out)-[A-Z]\w+/g, 2],
    [/\$[A-Za-z_]\w*\s*=/, 1],
    [/\s-(eq|ne|gt|lt|ge|le|like|match|and|or|not)\s/, 2],
    [/\|\s*(Where|Select|ForEach|Sort)-Object\b/, 3],
    [/\[(string|int|bool|array|hashtable)\]/i, 1.5],
  ],
};

/** Indizi che esistono solo in TypeScript: sopra c'è anche il punteggio di JavaScript. */
const TS_RULES: Rule[] = [
  [/:\s*(string|number|boolean|void|any|unknown|never)(\[\])?\b/g, 1.5],
  [/\binterface\s+\w+\s*(extends\s+[\w, ]+)?\{/, 3],
  [/\btype\s+\w+\s*=/, 2.5],
  [/\b(public|private|protected|readonly)\s+\w+\s*[:?]/, 2],
  [/\bas\s+(const|string|number|unknown)\b/, 2],
];

function scoreRules(text: string, rules: Rule[]): number {
  let s = 0;
  for (const [re, w] of rules) {
    if (re.global) {
      const n = text.match(re)?.length ?? 0;
      s += Math.min(3, n) * w;
    } else if (re.test(text)) {
      s += w;
    }
  }
  return s;
}

function isJson(text: string): boolean {
  const t = text.trim();
  if (!/^[[{]/.test(t) || t.length < 2) return false;
  try {
    const v: unknown = JSON.parse(t);
    return typeof v === "object" && v !== null;
  } catch {
    return false;
  }
}

/** Punteggio per linguaggio (il più alto vince). */
export function languageScores(text: string): Record<CodeLang, number> {
  const out = { plaintext: 0, typescript: 0 } as Record<CodeLang, number>;
  for (const lang of Object.keys(RULES) as (keyof typeof RULES)[]) out[lang] = scoreRules(text, RULES[lang]);
  if (isJson(text)) out.json = 8;
  const ts = scoreRules(text, TS_RULES);
  out.typescript = ts > 0 ? ts + out.javascript * 0.9 : 0;
  // C++ comprende C: con indizi di C++ vince lui.
  if (out.cpp > 0) out.cpp += out.c * 0.5;
  return out;
}

// Niente parole di una lettera (a, e, i): nel codice sono nomi di variabili.
const STOP_WORDS = new Set(
  "il lo la gli le un uno una di da in con su per tra fra che è non del della dei delle al alla nel nella sono ma come anche più the and of to is are was an that it this for with on be".split(" ")
);

/** Somiglianza con la prosa, 0..1: parole comuni e frasi che finiscono con il punto. */
function proseLevel(lines: string[]): number {
  const words = lines.join(" ").toLowerCase().match(/[a-zàèéìòù']+/g) ?? [];
  if (words.length === 0) return 0;
  const common = words.filter((w) => STOP_WORDS.has(w)).length / words.length;
  const sentences = lines.filter((l) => /[a-zàèéìòù][.!?]$/i.test(l.trim()) || /[.!?]\s+[A-ZÀÈÉ]/.test(l)).length / lines.length;
  return Math.min(1, common * 2.5 + sentences * 0.5);
}

/** Forma da codice, 0..1: fine riga tipiche, indentazione, densità di simboli. */
function shapeLevel(lines: string[], text: string): number {
  const ends = lines.filter((l) => /([;{}()[\]:,]|=>|\\)\s*$/.test(l)).length / lines.length;
  const indented = lines.length > 1 ? lines.filter((l) => /^(\t| {2,})\S/.test(l)).length / lines.length : 0;
  const symbols = (text.match(/[{}[\]();=<>+*/&|!$#@`\\]/g)?.length ?? 0) / Math.max(1, text.replace(/\s/g, "").length);
  return Math.min(1, ends * 0.45 + indented * 0.3 + Math.min(1, symbols * 7) * 0.35);
}

export function detectCode(raw: string, { hint = null, high = 0.62, medium = 0.4 }: DetectOptions = {}): CodeGuess {
  const text = raw.replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (text.trim().length < 4 || lines.length === 0) return { lang: hint ?? "plaintext", score: 0, level: "nessuna" };

  const scores = languageScores(text);
  let lang: CodeLang = "plaintext";
  let best = 0;
  for (const [l, s] of Object.entries(scores) as [CodeLang, number][]) {
    if (s > best) {
      best = s;
      lang = l;
    }
  }
  if (best < 1.5) lang = "plaintext";

  const prose = proseLevel(lines);
  let score = shapeLevel(lines, text) * 0.5 + Math.min(1, best / 6) * 0.65 - prose * 0.6;
  // Una riga sola è codice solo con indizi forti (es. una query SQL).
  if (lines.length === 1) score = Math.min(score, best >= 4 ? 0.7 : 0.45);
  if (hint) {
    // L'app da cui arriva (VS Code) dice che è codice: almeno "media", "alta" se ha più righe.
    lang = hint;
    score = Math.max(score, lines.length >= 2 ? 0.9 : 0.5);
  }
  score = Math.max(0, Math.min(1, score));
  const level: CodeConfidence = score >= high ? "alta" : score >= medium ? "media" : "nessuna";
  return { lang, score, level };
}
