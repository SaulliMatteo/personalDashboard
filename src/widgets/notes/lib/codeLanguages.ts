/**
 * Linguaggi dei blocchi di codice: l'UNICO elenco (selettore, ```lang, incolla, Markdown,
 * evidenziazione, sanitizeHtml). Logica pura.
 */

export const CODE_LANGUAGES = [
  { id: "plaintext", label: "Testo semplice", md: "text", aliases: ["text", "txt", "plain", "testo"] },
  { id: "python", label: "Python", md: "python", aliases: ["py", "python3"] },
  { id: "sql", label: "SQL", md: "sql", aliases: ["mysql", "postgres", "postgresql", "sqlite", "plsql", "tsql"] },
  { id: "java", label: "Java", md: "java", aliases: [] },
  { id: "javascript", label: "JavaScript", md: "javascript", aliases: ["js", "jsx", "mjs", "cjs", "node"] },
  { id: "typescript", label: "TypeScript", md: "typescript", aliases: ["ts", "tsx", "mts", "cts"] },
  { id: "c", label: "C", md: "c", aliases: ["h"] },
  { id: "cpp", label: "C++", md: "cpp", aliases: ["c++", "cc", "cxx", "hpp", "hxx"] },
  { id: "csharp", label: "C#", md: "csharp", aliases: ["c#", "cs"] },
  { id: "html", label: "HTML", md: "html", aliases: ["htm", "xml", "xhtml", "svg"] },
  { id: "css", label: "CSS", md: "css", aliases: ["scss", "less"] },
  { id: "json", label: "JSON", md: "json", aliases: ["jsonc", "json5"] },
  { id: "bash", label: "Bash", md: "bash", aliases: ["sh", "shell", "zsh", "console", "shellscript"] },
  { id: "powershell", label: "PowerShell", md: "powershell", aliases: ["ps", "ps1", "pwsh", "psm1"] },
] as const;

export type CodeLang = (typeof CODE_LANGUAGES)[number]["id"];

const BY_NAME = new Map<string, CodeLang>();
for (const l of CODE_LANGUAGES) {
  BY_NAME.set(l.id, l.id);
  BY_NAME.set(l.label.toLowerCase(), l.id); // anche il nome mostrato: "C++", "Testo semplice"…
  for (const a of l.aliases) BY_NAME.set(a, l.id);
}

/** Un nome di linguaggio qualunque (```py, VS Code "typescriptreact"…) → uno supportato, o null. */
export function normalizeLang(name: string | null | undefined): CodeLang | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (BY_NAME.has(key)) return BY_NAME.get(key)!;
  // Nomi di VS Code: javascriptreact, typescriptreact, shellscript…
  if (key === "javascriptreact") return "javascript";
  if (key === "typescriptreact") return "typescript";
  return null;
}

/**
 * Nome di un linguaggio che non abbiamo (es. "rust", "kotlin"): lo si tiene così com'è scritto,
 * ma solo con lettere, cifre e # + . _ - (va in un attributo e nel Markdown dopo ```).
 */
const CUSTOM_RE = /^[a-z][a-z0-9#+._-]{0,23}$/;

/**
 * Valore salvato (data-lang) → nome del linguaggio del blocco: uno supportato (il suo id), uno
 * scritto dall'utente (in minuscolo), oppure "plaintext".
 */
export function asLangName(value: unknown): string {
  if (typeof value !== "string") return "plaintext";
  const known = normalizeLang(value);
  if (known) return known;
  const custom = value.trim().toLowerCase();
  return CUSTOM_RE.test(custom) ? custom : "plaintext";
}

/** Quello che l'utente scrive nel campo del linguaggio → nome da salvare ("Visual Basic" → "visual-basic"). */
export function langFromInput(text: string): string {
  const known = normalizeLang(text);
  if (known) return known;
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9#+._-]/g, "")
    .replace(/^[^a-z]+/, "");
  return asLangName(cleaned.slice(0, 24));
}

/** Linguaggio per l'evidenziazione: uno supportato, altrimenti testo semplice (senza colori). */
export function asCodeLang(value: unknown): CodeLang {
  return (typeof value === "string" && normalizeLang(value)) || "plaintext";
}

/** Il linguaggio ha i colori (è tra quelli inclusi)? */
export function isKnownLang(name: string): boolean {
  return normalizeLang(name) !== null;
}

/** Nome da mostrare: quello del linguaggio supportato, o quello scritto dall'utente. */
export function langLabel(name: string): string {
  const known = normalizeLang(name);
  if (known) return CODE_LANGUAGES.find((l) => l.id === known)?.label ?? "Testo semplice";
  return asLangName(name) === "plaintext" ? "Testo semplice" : asLangName(name);
}

/** Nome nel Markdown (```python, ```rust). */
export function langMarkdown(name: string): string {
  const known = normalizeLang(name);
  if (known) return CODE_LANGUAGES.find((l) => l.id === known)?.md ?? "text";
  const custom = asLangName(name);
  return custom === "plaintext" ? "text" : custom;
}

/**
 * Riga "```py" (o solo "```") scritta nel testo: il linguaggio del blocco da creare; null se la
 * riga non è un'apertura di blocco. Un nome che non abbiamo (```rust) resta quello, senza colori.
 */
export function parseFence(line: string): string | null {
  const m = line.trim().match(/^```\s*([\w#+.-]*)$/);
  if (!m) return null;
  return asLangName(m[1]);
}
