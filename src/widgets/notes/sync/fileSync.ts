import { toCloudError } from "../../../core/cloud/errors";
import { downloadSyncFile, removeSyncFiles, SYNC_FILE_MAX_BYTES, syncFilePath, uploadSyncFile } from "../../../core/cloud/syncFilesApi";
import { SyncRepository } from "../../../core/sync/syncRepository";
import type { SyncTaskContext, SyncTaskResult } from "../../../core/sync/syncTasks";
import { listFileReferences, listFolders, listNoteDirs, listNotes } from "../data/notesRepository";
import { emitRemoteNotesChange } from "../lib/remoteChanges";
import {
  readSyncedFile,
  removeSyncedFile,
  setVaultEnabled,
  syncedFileExists,
  syncedFileRel,
  syncPending,
  writeSyncedFile,
} from "../lib/vault";
import { planFiles, type FileScope, type WantedFile } from "./filePlan";

/**
 * File cercati e non trovati nel cloud: fino a quando non si richiedono. Di solito l'altro dispositivo li sta ancora
 * caricando (manda prima le righe, poi i file), quindi si riprova presto; una miniatura facoltativa molto più tardi.
 */
const missingUntil = new Map<string, number>();
const RETRY_MISSING_MS = 60_000;
const RETRY_OPTIONAL_MS = 60 * 60_000;

/** Rete giù o sessione scaduta: il giro intero ritenta. Il resto riguarda un file solo. */
function isFatal(error: unknown): boolean {
  const { code } = toCloudError(error);
  return code === "unreachable" || code === "auth";
}

/**
 * I file delle Note (allegati, immagini, PDF, file delle raccolte) dopo ogni giro di sync, nella cartella del cloud
 * dell'utente (core/cloud/syncFilesApi.ts). Le righe che li chiedono viaggiano già con il sync; qui si caricano,
 * scaricano e cancellano i file come dice planFiles (filePlan.ts).
 */
export async function syncNoteFiles({ userId }: SyncTaskContext): Promise<SyncTaskResult> {
  const repo = await SyncRepository.open();
  const map = await repo.loadMap(["notes", "note_collections"]);
  const tableOf: Record<FileScope, string> = { note: "notes", collection: "note_collections" };
  const uidOf = new Map(map.map((m) => [`${m.tbl}:${m.localId}`, m.uid]));
  const localOf = new Map(map.map((m) => [`${m.tbl}:${m.uid}`, Number(m.localId)]));
  let dirs = await listNoteDirs();

  const relOf = (scope: FileScope, ownerId: number, name: string): string | null => {
    if (scope === "collection") return syncedFileRel({ collectionId: ownerId }, name);
    const dir = dirs.get(ownerId);
    return dir ? syncedFileRel({ noteDir: dir }, name) : null;
  };

  const wanted: WantedFile[] = [];
  for (const ref of await listFileReferences()) {
    const ownerUid = uidOf.get(`${tableOf[ref.scope]}:${ref.ownerId}`);
    if (!ownerUid) continue;
    const rel = relOf(ref.scope, ref.ownerId, ref.name);
    wanted.push({ ...ref, ownerUid, local: rel !== null && (await syncedFileExists(rel)) });
  }

  const touched = new Set<number>();
  let collectionsTouched = false;
  let vaultReady = false;
  let retrySoon = false;

  /** Una nota appena arrivata non ha ancora la sua cartella su disco: si scrive (accendendo la copia su disco). */
  async function ensureNoteDir(noteId: number): Promise<void> {
    if (dirs.get(noteId)) return;
    if (!vaultReady) {
      await setVaultEnabled(true);
      vaultReady = true;
    }
    const note = (await listNotes()).find((n) => n.id === noteId);
    if (note) await syncPending([note], await listFolders());
    dirs = await listNoteDirs();
  }

  for (const action of planFiles(wanted, await repo.knownFiles(userId))) {
    try {
      if (action.type === "upload") {
        const { file } = action;
        const rel = relOf(file.scope, file.ownerId, file.name);
        if (!rel) continue;
        const bytes = await readSyncedFile(rel);
        if (bytes.length > SYNC_FILE_MAX_BYTES) {
          console.warn("Sync: file oltre 50 MB non sincronizzato");
          continue;
        }
        await uploadSyncFile(syncFilePath(userId, file.scope, file.ownerUid, file.name), bytes);
        await repo.addKnownFile(userId, file.scope, file.ownerUid, file.name);
      } else if (action.type === "download") {
        const { file } = action;
        const path = syncFilePath(userId, file.scope, file.ownerUid, file.name);
        if ((missingUntil.get(path) ?? 0) > Date.now()) continue;
        const bytes = await downloadSyncFile(path);
        if (!bytes) {
          missingUntil.set(path, Date.now() + (file.optional ? RETRY_OPTIONAL_MS : RETRY_MISSING_MS));
          retrySoon ||= !file.optional;
          continue;
        }
        missingUntil.delete(path);
        if (file.scope === "note") await ensureNoteDir(file.ownerId);
        const rel = relOf(file.scope, file.ownerId, file.name);
        if (!rel) continue;
        await writeSyncedFile(rel, bytes);
        await repo.addKnownFile(userId, file.scope, file.ownerUid, file.name);
        if (file.scope === "note") touched.add(file.ownerId);
        else collectionsTouched = true;
      } else {
        const { file } = action;
        const scope = file.scope as FileScope;
        await removeSyncFiles([syncFilePath(userId, scope, file.ownerUid, file.name)]);
        const ownerId = localOf.get(`${tableOf[scope] ?? ""}:${file.ownerUid}`);
        const rel = ownerId === undefined ? null : relOf(scope, ownerId, file.name);
        if (rel) await removeSyncedFile(rel);
        await repo.removeKnownFile(userId, file.scope, file.ownerUid, file.name);
      }
    } catch (error) {
      if (isFatal(error)) throw error;
      console.warn(`Sync: file non sincronizzato (${action.type}, ${toCloudError(error).code})`);
    }
  }

  // immagini e PDF arrivati: chi mostra quelle note le rilegge
  if (touched.size > 0 || collectionsTouched) emitRemoteNotesChange({ noteIds: touched });
  return retrySoon ? { retryInMs: RETRY_MISSING_MS } : undefined;
}
