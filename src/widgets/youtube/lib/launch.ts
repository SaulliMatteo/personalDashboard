/**
 * Ponte tra il widget in dashboard e la pagina di dettaglio: il widget segna
 * quale video aprire e poi naviga; la pagina lo legge UNA volta all'apertura.
 * È una variabile di modulo e non uno stato React perché widget e pagina non
 * sono mai montati insieme (la navigazione sostituisce la vista).
 */
let pendingYoutubeId: string | null = null;

export function requestOpenVideo(youtubeId: string): void {
  pendingYoutubeId = youtubeId;
}

/** Restituisce il video richiesto e lo "consuma": una seconda lettura dà null. */
export function takePendingVideo(): string | null {
  const id = pendingYoutubeId;
  pendingYoutubeId = null;
  return id;
}
