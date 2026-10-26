/** Messaggio di un errore delle azioni (sempre una frase nostra, mai il testo del server). */
export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Qualcosa è andato storto. Riprova.";
}
