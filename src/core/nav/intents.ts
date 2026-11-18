/*
 * Richieste a una pagina di dettaglio da fuori (es. il Calendario che apre una nota o il timer dello Studio).
 * La navigazione apre solo il dettaglio di un widget, senza parametri: chi chiede segna qui cosa vuole e poi
 * chiama openWidgetDetail(widgetId); la pagina la legge UNA volta all'apertura con takeWidgetIntent.
 * Un widget non importa mai un altro widget: passano tutti da qui.
 */

/** Cosa si può chiedere, per widget. */
export interface WidgetIntents {
  /** Apri questa nota nel Quaderno. */
  notes: { type: "openNote"; noteId: number };
  /** Apri il timer dello Studio con questa materia pronta (senza farlo partire). */
  study: { type: "openTimer"; subjectId: number | null };
  /** Apri il Calendario in una vista, o con l'evento rapido per un elemento nuovo (dalle sue card). */
  calendar: { type: "openView"; view: "month" | "week" | "day" } | { type: "new" };
}

export type IntentWidgetId = keyof WidgetIntents;

const pending = new Map<IntentWidgetId, WidgetIntents[IntentWidgetId]>();

export function requestWidgetIntent<K extends IntentWidgetId>(widgetId: K, intent: WidgetIntents[K]): void {
  pending.set(widgetId, intent);
}

/** La richiesta senza consumarla (per leggerla in un inizializzatore, che StrictMode chiama due volte). */
export function peekWidgetIntent<K extends IntentWidgetId>(widgetId: K): WidgetIntents[K] | null {
  return (pending.get(widgetId) as WidgetIntents[K] | undefined) ?? null;
}

/** Restituisce la richiesta e la "consuma": una seconda lettura dà null. */
export function takeWidgetIntent<K extends IntentWidgetId>(widgetId: K): WidgetIntents[K] | null {
  const intent = pending.get(widgetId) as WidgetIntents[K] | undefined;
  pending.delete(widgetId);
  return intent ?? null;
}
