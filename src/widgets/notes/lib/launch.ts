import { requestWidgetIntent, takeWidgetIntent } from "../../../core/nav/intents";

/**
 * Ponte tra chi apre una nota (widget in dashboard, chat, Calendario) e il Quaderno: chi apre segna quale nota e
 * poi naviga; la pagina la legge UNA volta all'apertura. La richiesta sta in core/nav/intents.ts, così può
 * arrivare anche da un altro widget.
 */
export function requestOpenNote(id: number): void {
  requestWidgetIntent("notes", { type: "openNote", noteId: id });
}

/** Restituisce la nota richiesta e la "consuma": una seconda lettura dà null. */
export function takePendingNote(): number | null {
  return takeWidgetIntent("notes")?.noteId ?? null;
}
