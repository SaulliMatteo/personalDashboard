/*
 * Tipi del Calendario. Gli istanti sono millisecondi epoch (come nel resto dell'app); i giorni sono chiavi
 * locali "YYYY-MM-DD" (lib/dates.ts).
 */

/**
 * event = quadratino del colore della categoria; study = sessione di studio pianificata (cerchio);
 * reminder = promemoria (campanella): un solo orario (fine = inizio), suona da solo a quell'ora, si spunta come fatto.
 */
export type ItemKind = "event" | "study" | "reminder";

export type RepeatFreq = "day" | "week" | "month" | "year";

/**
 * Regola di una serie. `weekdays` (solo "week"): bit 0 = lunedì … bit 6 = domenica, 0 = il giorno dell'inizio.
 * Fine: `until` (istante: l'ultima occorrenza inizia entro lì) oppure `count` (quante, contando anche le saltate),
 * entrambi null = per sempre. `exdates`: inizi delle occorrenze saltate o spostate in un'eccezione.
 */
export interface RepeatRule {
  freq: RepeatFreq;
  interval: number;
  weekdays: number;
  until: number | null;
  count: number | null;
  exdates: number[];
}

/**
 * Promemoria: `offset` = minuti prima dell'inizio; `at` = alle HH:MM di `days` giorni prima (0 = il giorno stesso),
 * es. "Il giorno prima, 20:00" = { type: "at", days: 1, time: "20:00" }.
 */
export type Reminder = { type: "offset"; minutes: number } | { type: "at"; days: number; time: string };

export type PropType = "text" | "number" | "select" | "checkbox" | "date" | "link";
export type PropValue = string | number | boolean | null;

/** Una proprietà personalizzata (comune a tutti gli eventi). `uid` è la chiave dei valori in `props`. */
export interface CalendarProperty {
  id: number;
  uid: string;
  name: string;
  type: PropType;
  /** Scelte di "select". */
  options: string[];
  position: number;
}

export interface Todo {
  text: string;
  done: boolean;
}

export interface CalendarCategory {
  id: number;
  name: string;
  color: string;
  position: number;
}

export interface CalendarEvent {
  id: number;
  kind: ItemKind;
  title: string;
  startAt: number;
  endAt: number;
  allDay: boolean;
  categoryId: number | null;
  subjectId: number | null;
  /** Sessione di studio collegata a questo evento. */
  parentId: number | null;
  /** Eccezione "solo questa" della serie `seriesId`, al posto dell'occorrenza che iniziava a `originalStart`. */
  seriesId: number | null;
  originalStart: number | null;
  /** Colore scelto per l'evento (sovrascrive la categoria). */
  color: string | null;
  repeat: RepeatRule | null;
  reminders: Reminder[];
  props: Record<string, PropValue>;
  todos: Todo[];
  description: string;
  /** Solo promemoria: inizi delle occorrenze segnate come fatte. */
  done: number[];
  createdAt: number;
  updatedAt: number;
}

/** Un'occorrenza da disegnare: l'evento (o la serie) con i suoi istanti in quel punto. */
export interface Occurrence {
  event: CalendarEvent;
  start: number;
  end: number;
  /** Unica tra tutte le occorrenze: "id:inizio". */
  key: string;
  /** Viene da una serie (modificarla chiede "solo questa / tutte"). */
  recurring: boolean;
}

/** Una nota del Quaderno collegata a un giorno e/o a un evento. */
export interface NoteLink {
  id: number;
  noteId: number;
  day: string | null;
  eventId: number | null;
}

export type CalendarView = "month" | "week" | "day";
