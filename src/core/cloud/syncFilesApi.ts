import { requireCloudClient } from "./client";
import { CloudError } from "./errors";

/*
 * File del sync dei propri dati (supabase/migrations/…_sync_file.sql): bucket privato "sync-files", ognuno nella sua
 * cartella. Percorso: <user_id>/<ambito>/<id globale del proprietario>/<nome in base64url>. Il nome è codificato perché
 * Storage non accetta molti caratteri (accentate, parentesi quadre…) e i nomi dei file sono dell'utente.
 */

const BUCKET = "sync-files";

/** Lo stesso limite del bucket (e degli allegati delle note). */
export const SYNC_FILE_MAX_BYTES = 50 * 1024 * 1024;

/** A chi appartiene un file: una nota (allegati, immagini, PDF) o una raccolta (campi File). */
export type SyncFileScope = "note" | "collection";

function encodeName(name: string): string {
  const bytes = new TextEncoder().encode(name);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function syncFilePath(userId: string, scope: SyncFileScope, ownerUid: string, name: string): string {
  return `${userId}/${scope}/${ownerUid}/${encodeName(name)}`;
}

/** Errori di Storage: nessuna risposta o 5xx = non raggiungibile; il testo del server non va nei log. */
function storageError(error: unknown): CloudError {
  const status = Number((error as { statusCode?: unknown; status?: unknown })?.statusCode ?? (error as { status?: unknown })?.status);
  const message = error instanceof Error ? error.message : "";
  if (!Number.isFinite(status) || status === 0 || status >= 500 || /fetch|network|abort/i.test(message)) return new CloudError("unreachable");
  if (status === 401) return new CloudError("auth");
  return new CloudError("unknown");
}

function isNotFound(error: unknown): boolean {
  const e = error as { statusCode?: unknown; status?: unknown; message?: unknown };
  return String(e?.statusCode ?? e?.status) === "404" || /not.?found/i.test(String(e?.message ?? ""));
}

/** Carica (o sostituisce) un file. */
export async function uploadSyncFile(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await requireCloudClient()
    .storage.from(BUCKET)
    .upload(path, new Blob([bytes as BlobPart]), { upsert: true, contentType: "application/octet-stream" });
  if (error) throw storageError(error);
}

/** I byte di un file, o null se nel cloud non c'è (ancora). */
export async function downloadSyncFile(path: string): Promise<Uint8Array | null> {
  const { data, error } = await requireCloudClient().storage.from(BUCKET).download(path);
  if (error) {
    if (isNotFound(error)) return null;
    throw storageError(error);
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeSyncFiles(paths: readonly string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await requireCloudClient().storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw storageError(error);
  }
}

/** Tutti i percorsi sotto una cartella (anche nelle sottocartelle). */
async function listAll(prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await requireCloudClient().storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw storageError(error);
    for (const entry of data ?? []) {
      // le cartelle non hanno id
      if (entry.id) out.push(`${prefix}/${entry.name}`);
      else out.push(...(await listAll(`${prefix}/${entry.name}`)));
    }
    if ((data ?? []).length < 1000) return out;
  }
}

/** Cancella tutti i propri file del sync (prima di eliminare l'account: Storage non li cancella a cascata). */
export async function clearSyncFiles(userId: string): Promise<void> {
  await removeSyncFiles(await listAll(userId));
}
