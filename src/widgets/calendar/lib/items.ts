import type { SubjectRef } from "../../../core/study/studyReadRepository";
import type { StudyState } from "./studyProgress";
import type { CalendarCategory, Occurrence } from "./types";

/*
 * Come si presenta un'occorrenza (nome e colore), pura. Il colore è quello scelto dall'utente (evento, categoria o
 * materia): null = nessun colore scelto, il componente usa i token del tema.
 */

/** Studio fatto/pianificato di una sessione pianificata. */
export interface StudyInfo {
  doneSeconds: number;
  state: StudyState;
}

/** La forma piena: sessione di studio fatta, o promemoria spuntato. */
export function isFilled(o: Occurrence, study: ReadonlyMap<string, StudyInfo>): boolean {
  if (o.event.kind === "reminder") return o.event.done.includes(o.start);
  return o.event.kind === "study" && study.get(o.key)?.state === "done";
}

export interface ItemLookups {
  subjects: ReadonlyMap<number, SubjectRef>;
  categories: ReadonlyMap<number, CalendarCategory>;
}

/** Il nome: per le sessioni di studio la materia (il titolo è il dettaglio), per gli eventi il titolo. */
export function itemLabel(o: Occurrence, lookups: ItemLookups): string {
  const e = o.event;
  if (e.kind === "study") {
    const subject = e.subjectId === null ? undefined : lookups.subjects.get(e.subjectId);
    return subject?.name ?? (e.title || "Studio");
  }
  return e.title || "Senza titolo";
}

/** Il dettaglio sotto il nome: per le sessioni il titolo (se diverso dalla materia), per gli eventi niente. */
export function itemDetail(o: Occurrence, lookups: ItemLookups): string {
  const e = o.event;
  if (e.kind !== "study") return "";
  const label = itemLabel(o, lookups);
  return e.title && e.title !== label ? e.title : "";
}

export function itemColor(o: Occurrence, lookups: ItemLookups): string | null {
  const e = o.event;
  if (e.kind === "study") return (e.subjectId === null ? undefined : lookups.subjects.get(e.subjectId))?.color ?? null;
  if (e.color) return e.color;
  return (e.categoryId === null ? undefined : lookups.categories.get(e.categoryId))?.color ?? null;
}
