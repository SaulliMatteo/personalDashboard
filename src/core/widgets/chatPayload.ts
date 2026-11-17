/* Controlli comuni dei payload delle schede in chat (chatActions.ts): puri, senza React (provati con node). */

/** Caratteri di controllo e di direzione del testo (come la chat dei Gruppi): un titolo non deve "girare" la riga. */
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Testo su una riga da un valore qualunque: stringa, senza caratteri di controllo, tagliata a `max`; null se vuoto. */
export function asCleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/*
 * File delle schede (core/cloud/friendFilesApi.ts): una scheda con file porta `files: { batch: "<uuid>", list }`; i
 * file stanno nel lotto <mittente>/<destinatario>/<batch> del bucket degli amici.
 */

/** Al massimo per invio (somma dei file), deciso con l'utente; il bucket ferma ogni file oltre questo. */
export const CHAT_FILES_MAX_BYTES = 10 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function asBatchId(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

/** Il lotto di file di un payload, se ne ha uno. */
export function batchOfPayload(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.files)) return null;
  return asBatchId(payload.files.batch);
}
