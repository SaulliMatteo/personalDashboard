import type { ItemKind } from "../lib/types";

/** Quali tipi di elementi si vedono (filtri in alto: Eventi, Studio, Promemoria, Note). */
export interface CalendarFilters {
  event: boolean;
  study: boolean;
  reminder: boolean;
  note: boolean;
}

export const ALL_FILTERS: CalendarFilters = { event: true, study: true, reminder: true, note: true };

/** Un elemento di quel tipo passa i filtri? (le note hanno la loro riga, vedi le viste) */
export function kindShown(filters: CalendarFilters, kind: ItemKind): boolean {
  return filters[kind];
}
