/**
 * Codice invito: 8 caratteri dall'alfabeto del server (`private.new_invite_code` in supabase/migrations), senza
 * 0 O 1 I L che si confondono. Si mostra come "K7QM-3XRQ"; chi lo scrive può usare minuscole, trattini e spazi.
 */

export const INVITE_CODE_LENGTH = 8;

const ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]*$/;

/** Il codice come lo vuole il server: maiuscolo, senza separatori. */
export function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

/** Il codice da mostrare (o mentre lo si scrive): a gruppi di 4 separati da un trattino. */
export function formatInviteCode(raw: string): string {
  const code = normalizeInviteCode(raw).slice(0, INVITE_CODE_LENGTH);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** true se (normalizzato) ha la forma giusta: evita una richiesta, e un tentativo, per un errore di battitura. */
export function isInviteCodeComplete(raw: string): boolean {
  const code = normalizeInviteCode(raw);
  return code.length === INVITE_CODE_LENGTH && ALPHABET.test(code);
}
