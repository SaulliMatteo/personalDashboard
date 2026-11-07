import { getMeta, setMeta } from "../../../core/db/meta";
import { createNote, ensureTopFolder, noteExists } from "../data/notesRepository";
import { sanitizeHtml } from "../lib/html";
import type { NoteCardPayload } from "./notePayload";

/*
 * Note e chat degli amici: l'HTML che entra ed esce, e quale nota locale corrisponde a una scheda (quella mandata,
 * o la copia salvata da quella ricevuta), per mostrare "Apri" invece di "Salva" anche dopo.
 */

/** Cartella in cui finiscono le note ricevute. */
export const RECEIVED_FOLDER = "Ricevute";

/** Come l'HTML incollato da fuori: niente blocchi (file della nota), viste, righe collegate e segni. */
export const cleanNoteHtml = (html: string) => sanitizeHtml(html, { source: "esterno" });

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

/** Salva una copia della nota ricevuta in "Ricevute" e la lega alla scheda. */
export async function saveReceivedNote(messageId: string, payload: NoteCardPayload): Promise<number> {
  const folderId = await ensureTopFolder(RECEIVED_FOLDER);
  const id = await createNote(folderId, { title: payload.title, tags: [], titleColor: payload.titleColor, pages: payload.pages });
  await rememberNote(messageId, id);
  return id;
}
