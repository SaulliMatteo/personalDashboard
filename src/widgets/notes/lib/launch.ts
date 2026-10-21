/**
 * Ponte tra il widget in dashboard e il Quaderno: il widget segna quale nota
 * aprire e poi naviga; la pagina la legge UNA volta all'apertura (come
 * youtube/lib/launch.ts: widget e pagina non sono mai montati insieme).
 */
let pendingNoteId: number | null = null;

export function requestOpenNote(id: number): void {
  pendingNoteId = id;
}

/** Restituisce la nota richiesta e la "consuma": una seconda lettura dà null. */
export function takePendingNote(): number | null {
  const id = pendingNoteId;
  pendingNoteId = null;
  return id;
}
