import { addNoteLink, removeNoteLink } from "./calendarRepository";
import { notifyCalendarChanged } from "./calendarChanges";

/** Collega una nota del Quaderno a un giorno ("YYYY-MM-DD") o a un elemento, e lo annuncia. */
export async function linkNote(noteId: number, target: { day: string | null; eventId: number | null }): Promise<void> {
  await addNoteLink(noteId, target);
  notifyCalendarChanged();
}

export async function unlinkNote(linkId: number): Promise<void> {
  await removeNoteLink(linkId);
  notifyCalendarChanged();
}
