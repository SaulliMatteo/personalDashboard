import { shiftSeries, withExdate } from "../lib/recurrence";
import type { CalendarEvent, Occurrence } from "../lib/types";
import { createEvent, deleteEvent, duplicateEvent, listSeriesExceptions, updateEvent, type EventFields } from "./calendarRepository";
import { notifyCalendarChanged } from "./calendarChanges";

/*
 * Modifiche a una singola occorrenza, con la scelta "solo questa / tutte" per le serie:
 *  - non ripetuta (o eccezione): si cambia la riga;
 *  - "one": l'occorrenza diventa un'eccezione (riga sua con series_id) e la serie la salta;
 *  - "all": cambia la serie (spostare un'occorrenza sposta tutta la serie, eccezioni comprese).
 */

export type SeriesScope = "one" | "all";

function fieldsOf(event: CalendarEvent): EventFields {
  const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = event;
  return fields;
}

/** Nuovi istanti (e altri campi) per l'occorrenza. */
export async function changeOccurrence(
  occ: Occurrence,
  change: Partial<EventFields> & { startAt: number; endAt: number },
  scope: SeriesScope
): Promise<void> {
  const { event } = occ;
  if (!occ.recurring || !event.repeat) {
    await updateEvent(event.id, change);
  } else if (scope === "one") {
    await createEvent({
      ...fieldsOf(event),
      ...change,
      repeat: null,
      seriesId: event.id,
      originalStart: occ.start,
    });
    await updateEvent(event.id, { repeat: withExdate(event.repeat, occ.start) });
  } else {
    const { startAt, endAt, ...rest } = change;
    const moved = shiftSeries(event, occ.start, startAt, endAt - startAt);
    await updateEvent(event.id, { ...rest, ...moved });
    // le eccezioni restano dove sono, ma il loro "posto" nella serie si sposta con lei
    if (startAt !== occ.start) {
      for (const ex of await listSeriesExceptions(event.id)) {
        if (ex.originalStart === null) continue;
        const shifted = shiftSeries({ ...event, startAt: ex.originalStart, repeat: null }, occ.start, startAt);
        await updateEvent(ex.id, { originalStart: shifted.startAt });
      }
    }
  }
  notifyCalendarChanged();
}

/** Elimina l'occorrenza ("one": la serie la salta) o tutto l'elemento / tutta la serie. */
export async function deleteOccurrence(occ: Occurrence, scope: SeriesScope): Promise<void> {
  const { event } = occ;
  if (occ.recurring && event.repeat && scope === "one") {
    await updateEvent(event.id, { repeat: withExdate(event.repeat, occ.start) });
  } else {
    await deleteEvent(event.id);
  }
  notifyCalendarChanged();
}

/** Crea un elemento nuovo e lo annuncia. */
export async function addEvent(fields: EventFields): Promise<number> {
  const id = await createEvent(fields);
  notifyCalendarChanged();
  return id;
}

/**
 * "Modifica solo questa": l'occorrenza diventa un elemento a sé (eccezione della serie, stessi campi) e la serie la
 * salta. Restituisce l'id della riga nuova (quella che il pannello apre al posto della serie).
 */
export async function detachOccurrence(occ: Occurrence): Promise<number> {
  const { event } = occ;
  if (!occ.recurring || !event.repeat) return event.id;
  const id = await createEvent({
    ...fieldsOf(event),
    startAt: occ.start,
    endAt: occ.end,
    repeat: null,
    seriesId: event.id,
    originalStart: occ.start,
  });
  await updateEvent(event.id, { repeat: withExdate(event.repeat, occ.start) });
  notifyCalendarChanged();
  return id;
}

/** Cambia campi che non sono gli orari (titolo, colore, proprietà…) dell'elemento o di tutta la serie. */
export async function changeFields(eventId: number, change: Partial<EventFields>): Promise<void> {
  await updateEvent(eventId, change);
  notifyCalendarChanged();
}

/** Promemoria: segna (o toglie) come fatta questa occorrenza. */
export async function toggleReminderDone(occ: Occurrence): Promise<void> {
  const { event } = occ;
  const done = event.done.includes(occ.start) ? event.done.filter((x) => x !== occ.start) : [...event.done, occ.start];
  await updateEvent(event.id, { done });
  notifyCalendarChanged();
}

/** Una copia dell'elemento (la serie intera, se si ripete). */
export async function duplicate(eventId: number): Promise<number | null> {
  const id = await duplicateEvent(eventId);
  notifyCalendarChanged();
  return id;
}
