/**
 * Regole del nome utente, le stesse del server (vincolo `profiles_username_format` e `set_username`
 * in supabase/migrations): qui servono solo per dare un messaggio prima di inviare.
 */

export const USERNAME_RULES =
  "Da 3 a 20 caratteri: lettere minuscole senza accenti, numeri, _ e punto (non all'inizio, non alla fine, mai due di fila).";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Problema del nome (già normalizzato), oppure null se va bene. */
export function usernameProblem(name: string): string | null {
  if (name.length < 3) return "Almeno 3 caratteri.";
  if (name.length > 20) return "Al massimo 20 caratteri.";
  if (!/^[a-z0-9_.]+$/.test(name)) return "Solo lettere minuscole senza accenti, numeri, _ e punto.";
  if (name.startsWith(".") || name.endsWith(".") || name.includes("..")) {
    return "Il punto non può stare all'inizio, alla fine o due volte di fila.";
  }
  return null;
}
