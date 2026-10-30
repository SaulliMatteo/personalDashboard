import { readFile } from "@tauri-apps/plugin-fs";
import { extensionOf, isImageName } from "./attachmentUrls";
import { sanitizeHtml } from "./html";
import { markdownToHtml, parseFrontmatter, plainTextToHtml } from "./markdown";
import { baseName } from "./vault";

/** File da mettere in una nota: nome e contenuto. */
export interface IncomingFile {
  name: string;
  bytes: Uint8Array;
}

/** Cosa diventa un file dentro la pagina. */
export type FileKind = "image" | "markdown" | "text" | "file";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function classifyFile(name: string): FileKind {
  if (isImageName(name)) return "image";
  const ext = extensionOf(name);
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "txt") return "text";
  return "file";
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** Legge i file scelti o trascinati dal sistema (percorsi assoluti). */
export async function readPaths(paths: string[]): Promise<IncomingFile[]> {
  const out: IncomingFile[] = [];
  for (const path of paths) out.push({ name: baseName(path), bytes: await readFile(path) });
  return out;
}

/** Il testo di un .md o .txt come HTML della nota (già ripulito). */
export function textFileToHtml(file: IncomingFile): string {
  const text = new TextDecoder().decode(file.bytes);
  if (classifyFile(file.name) === "markdown") return sanitizeHtml(markdownToHtml(parseFrontmatter(text).body));
  return sanitizeHtml(plainTextToHtml(text));
}

/** Nome per un'immagine incollata dagli appunti (non ha un nome suo). */
export function pastedImageName(type: string, now = new Date()): string {
  const ext = type === "image/jpeg" ? "jpg" : type === "image/gif" ? "gif" : type === "image/webp" ? "webp" : "png";
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  return `incollata ${stamp}.${ext}`;
}
