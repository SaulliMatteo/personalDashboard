import { requireCloudClient } from "./client";
import { encodeName, isNotFound, storageError } from "./storageFiles";

/*
 * File delle schede mandate a un amico (supabase/migrations/…_file_amici.sql): bucket privato "friend-files".
 * Percorso: <mittente>/<destinatario>/<lotto uuid>/<nome in base64url>. Carica solo il mittente e solo verso un amico;
 * leggono e cancellano mittente e destinatario. Un lotto è l'insieme dei file di un messaggio: chi lo riceve lo
 * cancella dopo averlo salvato, e dopo 30 giorni lo cancella la prima delle due app che passa di lì.
 *
 * Il payload di una scheda con file porta il lotto (`batchOfPayload` di core/widgets/chatPayload.ts, limite
 * CHAT_FILES_MAX_BYTES). Il percorso si costruisce da mittente e destinatario del messaggio (li decide il server), mai
 * da ciò che c'è nel payload.
 */

const BUCKET = "friend-files";

/** Dopo quanto un lotto non salvato si cancella. */
export const FRIEND_FILES_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export function newBatchId(): string {
  return crypto.randomUUID().toLowerCase();
}

export interface BatchPlace {
  sender: string;
  recipient: string;
  batch: string;
}

const batchPrefix = ({ sender, recipient, batch }: BatchPlace) => `${sender}/${recipient}/${batch}`;

export function friendFilePath(place: BatchPlace, name: string): string {
  return `${batchPrefix(place)}/${encodeName(name)}`;
}

export async function uploadFriendFile(place: BatchPlace, name: string, bytes: Uint8Array): Promise<void> {
  const { error } = await requireCloudClient()
    .storage.from(BUCKET)
    .upload(friendFilePath(place, name), new Blob([bytes as BlobPart]), { upsert: false, contentType: "application/octet-stream" });
  if (error) throw storageError(error);
}

/** I byte di un file, o null se non c'è (scaduto, o già salvato e cancellato). */
export async function downloadFriendFile(place: BatchPlace, name: string): Promise<Uint8Array | null> {
  const { data, error } = await requireCloudClient().storage.from(BUCKET).download(friendFilePath(place, name));
  if (error) {
    if (isNotFound(error)) return null;
    throw storageError(error);
  }
  return new Uint8Array(await data.arrayBuffer());
}

interface Listed {
  path: string;
  createdAt: number;
}

/** Tutti i file visibili sotto una cartella (anche nelle sottocartelle), con la data di caricamento. */
async function listAll(prefix: string): Promise<Listed[]> {
  const out: Listed[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await requireCloudClient().storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw storageError(error);
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // le cartelle non hanno id
      if (entry.id) out.push({ path, createdAt: Date.parse(entry.created_at ?? "") || 0 });
      else out.push(...(await listAll(path)));
    }
    if ((data ?? []).length < 1000) return out;
  }
}

async function removePaths(paths: readonly string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await requireCloudClient().storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw storageError(error);
  }
}

/** Cancella un lotto (salvato da chi l'ha ricevuto, messaggio eliminato o invio non riuscito). */
export async function removeFriendBatch(place: BatchPlace): Promise<void> {
  await removePaths((await listAll(batchPrefix(place))).map((f) => f.path));
}

/** Cancella i lotti tra due persone, nei due versi (amicizia tolta). */
export async function removeFriendPair(me: string, friend: string): Promise<void> {
  const files = [...(await listAll(`${me}/${friend}`)), ...(await listAll(`${friend}/${me}`))];
  await removePaths(files.map((f) => f.path));
}

/** Cancella i lotti mandati o ricevuti più vecchi di 30 giorni (si vedono solo i propri: le policy). */
export async function cleanupFriendFiles(now = Date.now()): Promise<void> {
  const old = (await listAll("")).filter((f) => f.createdAt > 0 && now - f.createdAt > FRIEND_FILES_KEEP_MS);
  await removePaths(old.map((f) => f.path));
}

/** Cancella tutti i file mandati o ricevuti (prima di eliminare l'account: Storage non li cancella a cascata). */
export async function clearFriendFiles(): Promise<void> {
  await removePaths((await listAll("")).map((f) => f.path));
}
