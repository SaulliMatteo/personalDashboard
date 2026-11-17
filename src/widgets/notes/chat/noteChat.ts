import { downloadFriendFile, newBatchId, removeFriendBatch, uploadFriendFile, type BatchPlace } from "../../../core/cloud/friendFilesApi";
import { getMeta, setMeta } from "../../../core/db/meta";
import { CHAT_FILES_MAX_BYTES } from "../../../core/widgets/chatPayload";
import {
  addAttachment,
  createNote,
  ensureTopFolder,
  listAttachments,
  listFolders,
  listNotes,
  noteExists,
  type NotePage,
} from "../data/notesRepository";
import { sanitizeHtml } from "../lib/html";
import { pdfThumbName } from "../lib/pdf/pdfData";
import { isVaultEnabled, readSyncedFile, setVaultEnabled, syncedFileRel, syncPending, writeSyncedFile } from "../lib/vault";
import { NoteFilesTooBigError, noteFileNames, type NoteCardPayload, type NoteFile } from "./notePayload";

/*
 * Note e chat degli amici: l'HTML che entra ed esce, i file della nota (letti dalla sua cartella, caricati nel lotto,
 * scaricati nella cartella della copia), e quale nota locale corrisponde a una scheda (quella mandata, o la copia
 * salvata da quella ricevuta), per mostrare "Apri" invece di "Salva" anche dopo.
 */

/** Cartella in cui finiscono le note ricevute. */
export const RECEIVED_FOLDER = "Ricevute";

/**
 * Come l'HTML incollato da fuori: niente viste, righe collegate e segni, e dei blocchi (immagini, file, collegamenti ai
 * PDF) solo quelli dei file che arrivano con la nota (`files`), scritti da noi nella cartella nuova.
 */
export const cleanNoteHtml = (html: string, files: ReadonlySet<string>) => sanitizeHtml(html, { source: "esterno", files });

const metaKey = (messageId: string) => `chat_note:${messageId}`;

export async function rememberNote(messageId: string, noteId: number): Promise<void> {
  await setMeta(metaKey(messageId), String(noteId));
}

/** La nota locale legata alla scheda, se c'è ancora (non nel cestino). */
export async function linkedNote(messageId: string): Promise<number | null> {
  const raw = await getMeta(metaKey(messageId));
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 && (await noteExists(id)) ? id : null;
}

/* ---------- Invio ---------- */

export interface LocalNoteFile extends NoteFile {
  bytes: Uint8Array;
}

/** Legge un file della cartella della nota; null se non c'è. */
async function readNoteFile(noteDir: string, name: string): Promise<Uint8Array | null> {
  try {
    return await readSyncedFile(syncedFileRel({ noteDir }, name));
  } catch {
    return null;
  }
}

/**
 * I file da mandare con una nota: allegati (immagini comprese), PDF delle pagine e le loro miniature. Quelli che non
 * sono sul disco restano fuori. Lancia NoteFilesTooBigError appena si superano i 10 MB (senza leggere il resto).
 */
export async function readNoteFiles(noteId: number, diskPath: string | null, pages: readonly NotePage[]): Promise<LocalNoteFile[]> {
  if (!diskPath) return [];
  const names = noteFileNames(pages, (await listAttachments(noteId)).map((a) => a.name));
  const out: LocalNoteFile[] = [];
  let total = 0;
  const add = (name: string, bytes: Uint8Array) => {
    total += bytes.length;
    if (total > CHAT_FILES_MAX_BYTES) throw new NoteFilesTooBigError();
    out.push({ name, size: bytes.length, bytes });
  };
  for (const name of names) {
    const bytes = await readNoteFile(diskPath, name);
    if (bytes) add(name, bytes);
  }
  // le miniature dei PDF (facoltative): l'elenco delle note le mostra senza aprire il PDF
  for (const p of pages) {
    if (!p.pdf || !out.some((f) => f.name === p.pdf?.file)) continue;
    const thumb = pdfThumbName(p.pdf.file);
    if (out.some((f) => f.name === thumb)) continue;
    const bytes = await readNoteFile(diskPath, thumb);
    if (bytes && total + bytes.length <= CHAT_FILES_MAX_BYTES) add(thumb, bytes);
  }
  return out;
}

/** Carica i file nel lotto nuovo verso l'amico; `onProgress` dopo ognuno. Se qualcosa va storto il lotto si cancella. */
export async function uploadNoteFiles(
  myId: string,
  friendId: string,
  files: readonly LocalNoteFile[],
  onProgress: (done: number) => void
): Promise<BatchPlace> {
  const place: BatchPlace = { sender: myId, recipient: friendId, batch: newBatchId() };
  try {
    for (let i = 0; i < files.length; i++) {
      await uploadFriendFile(place, files[i].name, files[i].bytes);
      onProgress(i + 1);
    }
  } catch (error) {
    await removeFriendBatch(place).catch(() => undefined);
    throw error;
  }
  return place;
}

/* ---------- Ricezione ---------- */

/** Cartella su disco della nota (accende la copia su disco: i file delle note vivono lì). */
async function noteDirFor(noteId: number): Promise<string> {
  if (!(await isVaultEnabled())) await setVaultEnabled(true);
  let note = (await listNotes()).find((n) => n.id === noteId);
  if (note && !note.diskPath) {
    await syncPending([note], await listFolders());
    note = (await listNotes()).find((n) => n.id === noteId);
  }
  if (!note?.diskPath) throw new Error("cartella della nota non creata");
  return note.diskPath;
}

export interface SavedNote {
  noteId: number;
  /** File che non c'erano più (scaduti dopo 30 giorni, o il messaggio è stato eliminato). */
  missing: number;
}

/**
 * Salva una copia della nota ricevuta in "Ricevute", scarica i suoi file nella sua cartella e la lega alla scheda.
 * Il lotto si cancella alla fine (i file poi viaggiano col proprio sync). `onProgress` dopo ogni file.
 */
export async function saveReceivedNote(
  messageId: string,
  payload: NoteCardPayload,
  where: { senderId: string; recipientId: string; mine: boolean },
  onProgress: (done: number) => void = () => undefined
): Promise<SavedNote> {
  const folderId = await ensureTopFolder(RECEIVED_FOLDER);
  const id = await createNote(folderId, { title: payload.title, tags: [], titleColor: payload.titleColor, pages: payload.pages });
  let missing = 0;
  if (payload.files) {
    const place: BatchPlace = { sender: where.senderId, recipient: where.recipientId, batch: payload.files.batch };
    const dir = await noteDirFor(id);
    // PDF delle pagine e loro miniature non sono allegati: si vedono come blocchi
    const pdfs = new Set(payload.pages.flatMap((p) => (p.pdf ? [p.pdf.file] : [])));
    const thumbs = new Set([...pdfs].map(pdfThumbName));
    let done = 0;
    for (const file of payload.files.list) {
      const bytes = await downloadFriendFile(place, file.name);
      if (bytes && bytes.length <= CHAT_FILES_MAX_BYTES) {
        await writeSyncedFile(syncedFileRel({ noteDir: dir }, file.name), bytes);
        if (!pdfs.has(file.name) && !thumbs.has(file.name)) await addAttachment(id, file.name, bytes.length);
      } else if (!thumbs.has(file.name)) {
        missing++;
      }
      onProgress(++done);
    }
    // salvata da chi l'ha ricevuta: il lotto non serve più (i file ora viaggiano col suo sync). Chi l'ha mandata e la
    // salva da un altro dispositivo non lo tocca: l'amico potrebbe non averla ancora salvata.
    if (!where.mine) {
      await removeFriendBatch(place).catch((e: unknown) => console.warn("File della nota ricevuta non cancellati dal cloud:", e));
    }
  }
  await rememberNote(messageId, id);
  return { noteId: id, missing };
}
