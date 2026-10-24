import { documentDir, join } from "@tauri-apps/api/path";
import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { getMeta, setMeta } from "../../../core/db";
import {
  addFolder,
  getPages,
  insertImportedNote,
  markSynced,
  updateFolder,
  type Folder,
  type InkStroke,
  type NewPageInput,
  type NotePage,
  type NoteSummary,
  type PageBackground,
} from "../data/notesRepository";
import { htmlToMarkdown } from "./html";
import { markdownToHtml, parseFrontmatter, parseMetaString, parseMetaTags } from "./markdown";

import { asPageColor } from "./pageColor";

/**
 * COPIA SU DISCO (Documenti/Notes). SQLite resta il database di lavoro; ogni
 * nota viene rispecchiata in formati aperti:
 *
 *   Notes/<cartelle>/<titolo>--<id>/
 *     nota.md        testo in Markdown con intestazione (titolo, tag, date)
 *     canvas.json    per pagina: tratti a mano, sfondo e HTML (per il ripristino fedele)
 *     allegati/      file allegati
 *   Notes/_cestino/…   note nel cestino
 *   Notes/<cartelle>/cartella.json   nome, colore e icona della cartella
 */

export const VAULT_DIR = "Notes";
const PAGE_MARKER = "<!-- pagina -->";
const ENABLED_KEY = "notes_vault_enabled";
const BASE = { baseDir: BaseDirectory.Document } as const;

export async function isVaultEnabled(): Promise<boolean> {
  return (await getMeta(ENABLED_KEY)) === "1";
}

export async function setVaultEnabled(enabled: boolean): Promise<void> {
  await setMeta(ENABLED_KEY, enabled ? "1" : "0");
}

export async function vaultAbsolutePath(): Promise<string> {
  return join(await documentDir(), VAULT_DIR);
}

export async function ensureVaultDir(): Promise<void> {
  await mkdir(VAULT_DIR, { ...BASE, recursive: true });
}

// ---------------------------------------------------------------------
// Percorsi
// ---------------------------------------------------------------------

export function slugify(text: string, fallback = "senza-titolo"): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || fallback;
}

function folderChain(folderId: number | null, byId: Map<number, Folder>): Folder[] {
  const chain: Folder[] = [];
  let current = folderId !== null ? byId.get(folderId) : undefined;
  while (current && chain.length < 12) {
    chain.unshift(current);
    current = current.parentId !== null ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/** Cartella della nota dentro Notes/, in base a titolo, cartelle e cestino. */
export function desiredNoteDir(note: NoteSummary, byId: Map<number, Folder>): string {
  const leaf = `${slugify(note.title)}--${note.id}`;
  if (note.deletedAt !== null) return `_cestino/${leaf}`;
  return [...folderChain(note.folderId, byId).map((f) => slugify(f.name, "cartella")), leaf].join("/");
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

// ---------------------------------------------------------------------
// Scrittura
// ---------------------------------------------------------------------

function buildMarkdown(note: NoteSummary, pages: NotePage[]): string {
  const front = [
    "---",
    `id: ${note.id}`,
    `title: ${JSON.stringify(note.title)}`,
    `tags: [${note.tags.map((t) => JSON.stringify(t)).join(", ")}]`,
    `starred: ${note.starred}`,
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
    "---",
    "",
  ].join("\n");
  const body = pages.map((p) => htmlToMarkdown(p.content)).join(`\n\n${PAGE_MARKER}\n\n`);
  return `${front}\n${body}\n`;
}

function buildCanvasJson(pages: NotePage[]): string {
  return JSON.stringify({
    version: 1,
    pages: pages.map((p) => ({ background: p.background, color: p.color, strokes: p.ink, html: p.content })),
  });
}

async function writeFolderMeta(chain: Folder[]): Promise<void> {
  const segments: string[] = [VAULT_DIR];
  for (const folder of chain) {
    segments.push(slugify(folder.name, "cartella"));
    await writeTextFile(
      `${segments.join("/")}/cartella.json`,
      JSON.stringify({ name: folder.name, color: folder.color, icon: folder.icon }),
      BASE
    );
  }
}

/** Scrive (e se serve sposta) la cartella di una nota. Ritorna il percorso relativo a Notes/. */
async function writeNote(note: NoteSummary, pages: NotePage[], byId: Map<number, Folder>): Promise<string> {
  const desired = desiredNoteDir(note, byId);
  const target = `${VAULT_DIR}/${desired}`;
  const previous = note.diskPath ? `${VAULT_DIR}/${note.diskPath}` : null;

  await mkdir(parentOf(target), { ...BASE, recursive: true });
  if (previous && previous !== target && (await exists(previous, BASE))) {
    try {
      await rename(previous, target, { oldPathBaseDir: BaseDirectory.Document, newPathBaseDir: BaseDirectory.Document });
    } catch (error) {
      console.error("Spostamento della cartella della nota non riuscito, la riscrivo:", error);
    }
  }
  await mkdir(target, { ...BASE, recursive: true });
  await writeTextFile(`${target}/nota.md`, buildMarkdown(note, pages), BASE);
  await writeTextFile(`${target}/canvas.json`, buildCanvasJson(pages), BASE);
  if (note.deletedAt === null) await writeFolderMeta(folderChain(note.folderId, byId));
  return desired;
}

/** Riscrive su disco solo le note cambiate (o spostate/rinominate). Ritorna quante. */
export async function syncPending(notes: NoteSummary[], folders: Folder[]): Promise<number> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  await ensureVaultDir();
  let written = 0;
  for (const note of notes) {
    const desired = desiredNoteDir(note, byId);
    const stale = note.syncedAt === null || note.syncedAt < note.updatedAt || note.diskPath !== desired;
    if (!stale) continue;
    const startedAt = Date.now();
    const pages = await getPages(note.id);
    const path = await writeNote(note, pages, byId);
    await markSynced(note.id, path, startedAt);
    written++;
  }
  return written;
}

export async function removeNoteDir(diskPath: string): Promise<void> {
  try {
    await remove(`${VAULT_DIR}/${diskPath}`, { ...BASE, recursive: true });
  } catch (error) {
    console.error("Impossibile eliminare la cartella della nota:", error);
  }
}

// ---------------------------------------------------------------------
// Allegati
// ---------------------------------------------------------------------

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "file";
}

/** Copia i byte in <nota>/allegati/ (aggiunge " (2)" se il nome esiste già). Ritorna il nome finale. */
export async function saveAttachmentFile(noteDir: string, name: string, bytes: Uint8Array): Promise<string> {
  const dir = `${VAULT_DIR}/${noteDir}/allegati`;
  await mkdir(dir, { ...BASE, recursive: true });
  const clean = safeFileName(name);
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  let finalName = clean;
  for (let n = 2; await exists(`${dir}/${finalName}`, BASE); n++) finalName = `${stem} (${n})${ext}`;
  await writeFile(`${dir}/${finalName}`, bytes, BASE);
  return finalName;
}

export async function removeAttachmentFile(noteDir: string, name: string): Promise<void> {
  try {
    await remove(`${VAULT_DIR}/${noteDir}/allegati/${name}`, BASE);
  } catch (error) {
    console.error("Impossibile eliminare l'allegato:", error);
  }
}

export async function attachmentAbsolutePath(noteDir: string, name: string): Promise<string> {
  return join(await documentDir(), VAULT_DIR, ...noteDir.split("/"), "allegati", name);
}

// ---------------------------------------------------------------------
// Importazione dalla cartella
// ---------------------------------------------------------------------

async function findNoteDirs(relative: string, found: string[]): Promise<void> {
  const path = relative ? `${VAULT_DIR}/${relative}` : VAULT_DIR;
  const entries = await readDir(path, BASE);
  if (entries.some((e) => e.isFile && e.name === "nota.md")) {
    found.push(relative);
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory) await findNoteDirs(relative ? `${relative}/${entry.name}` : entry.name, found);
  }
}

interface CanvasFilePage {
  background?: string;
  strokes?: InkStroke[];
  html?: string;
  color?: string | null;
}

async function readCanvasFile(dir: string): Promise<CanvasFilePage[] | null> {
  try {
    if (!(await exists(`${dir}/canvas.json`, BASE))) return null;
    const parsed: unknown = JSON.parse(await readTextFile(`${dir}/canvas.json`, BASE));
    const pages = (parsed as { pages?: unknown }).pages;
    return Array.isArray(pages) ? (pages as CanvasFilePage[]) : null;
  } catch {
    return null;
  }
}

function asBackground(value: string | undefined): PageBackground {
  return value === "dots" || value === "grid" || value === "lines" ? value : "none";
}

/**
 * Crea in SQLite le note trovate su disco che l'app non conosce ancora
 * (ripristino dopo una reinstallazione, o note scritte a mano in Markdown).
 */
export async function importVault(knownPaths: Set<string>, folders: Folder[]): Promise<number> {
  await ensureVaultDir();
  const dirs: string[] = [];
  await findNoteDirs("", dirs);

  const allFolders = [...folders];
  let imported = 0;

  for (const rel of dirs) {
    if (knownPaths.has(rel)) continue;
    const dir = `${VAULT_DIR}/${rel}`;
    const segments = rel.split("/");
    const trashed = segments[0] === "_cestino";
    const folderSegments = trashed ? [] : segments.slice(0, -1);

    // Cartelle: riusa quelle con lo stesso nome (o slug) e crea le mancanti.
    let parentId: number | null = null;
    const walked: string[] = [];
    for (const segment of folderSegments) {
      walked.push(segment);
      const existing: Folder | undefined = allFolders.find(
        (f) => f.parentId === parentId && slugify(f.name, "cartella") === segment
      );
      if (existing) {
        parentId = existing.id;
        continue;
      }
      let name = segment;
      let color: string | null = null;
      let icon = "folder";
      try {
        const metaPath = `${VAULT_DIR}/${walked.join("/")}/cartella.json`;
        if (await exists(metaPath, BASE)) {
          const meta = JSON.parse(await readTextFile(metaPath, BASE)) as { name?: string; color?: string | null; icon?: string };
          if (meta.name) name = meta.name;
          color = meta.color ?? null;
          if (meta.icon) icon = meta.icon;
        }
      } catch {
        /* cartella.json illeggibile: si usa il nome della cartella su disco */
      }
      const id = await addFolder(name, parentId);
      if (color || icon !== "folder") await updateFolder(id, { color, icon });
      allFolders.push({ id, parentId, name, color, icon, createdAt: Date.now() });
      parentId = id;
    }

    const { meta, body } = parseFrontmatter(await readTextFile(`${dir}/nota.md`, BASE));
    const canvas = await readCanvasFile(dir);
    const mdPages = body.split(PAGE_MARKER).map((chunk) => chunk.trim());
    const count = Math.max(canvas?.length ?? 0, mdPages.length);

    const pages: NewPageInput[] = [];
    for (let i = 0; i < count; i++) {
      const fromCanvas = canvas?.[i];
      pages.push({
        color: asPageColor(fromCanvas?.color),
        content: fromCanvas?.html ? fromCanvas.html : markdownToHtml(mdPages[i] ?? ""),
        ink: Array.isArray(fromCanvas?.strokes) ? fromCanvas.strokes : [],
        background: asBackground(fromCanvas?.background),
      });
    }

    const created = Date.parse(meta.created ?? "");
    const updated = Date.parse(meta.updated ?? "");
    const now = Date.now();
    await insertImportedNote({
      folderId: parentId,
      title: parseMetaString(meta.title) ?? segments[segments.length - 1].replace(/--\d+$/, "").replace(/-/g, " "),
      tags: parseMetaTags(meta.tags),
      starred: meta.starred === "true",
      createdAt: Number.isFinite(created) ? created : now,
      updatedAt: Number.isFinite(updated) ? updated : now,
      deletedAt: trashed ? now : null,
      diskPath: rel,
      pages,
    });
    imported++;
  }
  return imported;
}
