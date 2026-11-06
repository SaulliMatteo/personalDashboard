/**
 * Che cosa fare con i file delle Note a ogni giro di sync. Puro (lo prova scripts/sync/files.test.mts).
 *
 * I file che servono li dicono le righe già sincronizzate (allegati, PDF, campi File: `wanted`). `known` sono quelli
 * che risultano sia qui sia nel cloud dall'ultima volta. Quindi:
 * - chiesto, c'è qui, non noto → si carica;
 * - chiesto, non c'è qui → si scarica (se nel cloud non c'è ancora si riprova al giro dopo);
 * - noto ma non più chiesto (allegato o nota cancellati, qui o altrove) → si toglie dal cloud e da qui.
 */

export type FileScope = "note" | "collection";

export interface WantedFile {
  scope: FileScope;
  /** id locale del proprietario (nota o raccolta) */
  ownerId: number;
  /** suo id globale */
  ownerUid: string;
  name: string;
  /** facoltativo (miniatura di un PDF): se manca dappertutto non si cerca più */
  optional: boolean;
  /** il file c'è su questo dispositivo */
  local: boolean;
}

export interface KnownFile {
  scope: string;
  ownerUid: string;
  name: string;
}

export type FileAction =
  | { type: "upload"; file: WantedFile }
  | { type: "download"; file: WantedFile }
  | { type: "forget"; file: KnownFile };

export const fileKey = (f: { scope: string; ownerUid: string; name: string }) => `${f.scope}\u0000${f.ownerUid}\u0000${f.name}`;

export function planFiles(wanted: readonly WantedFile[], known: readonly KnownFile[]): FileAction[] {
  const knownKeys = new Set(known.map(fileKey));
  const wantedKeys = new Set<string>();
  const actions: FileAction[] = [];
  for (const file of wanted) {
    const key = fileKey(file);
    if (wantedKeys.has(key)) continue;
    wantedKeys.add(key);
    if (!file.local) actions.push({ type: "download", file });
    else if (!knownKeys.has(key)) actions.push({ type: "upload", file });
  }
  for (const file of known) if (!wantedKeys.has(fileKey(file))) actions.push({ type: "forget", file });
  return actions;
}
