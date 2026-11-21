import { useCallback, useEffect, useMemo, useState } from "react";
import { subscribeActivityEvents, useActivityStatus } from "../../../core/activity/activityBus";
import { getNoteRefs, type NoteRef } from "../../../core/notes/noteRefsRepository";
import { getStudySpansBetween, listActiveSubjects, type StudySpan, type SubjectRef } from "../../../core/study/studyReadRepository";
import { onSyncApplied } from "../../../core/sync/syncEvents";
import { useNow } from "../../../core/hooks/useNow";
import { listCategories, listDayNoteLinks, listEventNoteLinks, listEventsInRange } from "../data/calendarRepository";
import { onCalendarChanged } from "../data/calendarChanges";
import { dayKey } from "../lib/dates";
import type { StudyInfo } from "../lib/items";
import { expandEvents } from "../lib/recurrence";
import { STUDY_MARGIN_MS, liveSpan, matchStudy, studyState } from "../lib/studyProgress";
import type { CalendarCategory, CalendarEvent, NoteLink, Occurrence } from "../lib/types";

/*
 * I dati di un intervallo del Calendario (le viste e le card): occorrenze, note collegate ai giorni, materie,
 * categorie e studio fatto per ogni sessione pianificata. Si rilegge quando il calendario cambia, quando arriva il
 * sync (materie, sessioni, note) e quando finisce una sessione di studio; lo studio in corso conta subito.
 */

interface Loaded {
  events: CalendarEvent[];
  notes: NoteLink[];
  /** Note collegate agli elementi (per id dell'elemento: la serie, non la singola occorrenza). */
  eventNotes: Map<number, NoteLink[]>;
  noteRefs: Map<number, NoteRef>;
  subjects: Map<number, SubjectRef>;
  subjectList: SubjectRef[];
  categories: Map<number, CalendarCategory>;
  categoryList: CalendarCategory[];
  spans: StudySpan[];
}

export interface CalendarData extends Omit<Loaded, "events" | "spans"> {
  ready: boolean;
  occurrences: Occurrence[];
  study: Map<string, StudyInfo>;
  now: Date;
}

const EMPTY: Loaded = {
  events: [],
  notes: [],
  eventNotes: new Map(),
  noteRefs: new Map(),
  subjects: new Map(),
  subjectList: [],
  categories: new Map(),
  categoryList: [],
  spans: [],
};

export function useCalendarData(rangeStart: number, rangeEnd: number): CalendarData {
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const now = useNow();
  const activity = useActivityStatus();

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const offChanged = onCalendarChanged(reload);
    const offSync = onSyncApplied(({ kinds }) => {
      if (kinds.has("subject") || kinds.has("session") || kinds.has("note")) reload();
    });
    const offActivity = subscribeActivityEvents((e) => {
      if (e.type === "studyStopped") reload();
    });
    return () => {
      offChanged();
      offSync();
      offActivity();
    };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [events, notes, subjectList, categoryList, spans] = await Promise.all([
        listEventsInRange(rangeStart, rangeEnd),
        listDayNoteLinks(dayKey(rangeStart), dayKey(rangeEnd - 1)),
        listActiveSubjects(),
        listCategories(),
        getStudySpansBetween(rangeStart - STUDY_MARGIN_MS, rangeEnd + STUDY_MARGIN_MS),
      ]);
      const eventLinks = await listEventNoteLinks(events.map((e) => e.id));
      const refs = await getNoteRefs([...notes, ...eventLinks].map((n) => n.noteId));
      if (cancelled) return;
      const noteRefs = new Map(refs.map((r) => [r.id, r]));
      const eventNotes = new Map<number, NoteLink[]>();
      for (const link of eventLinks) {
        if (link.eventId === null || !noteRefs.has(link.noteId)) continue;
        eventNotes.set(link.eventId, [...(eventNotes.get(link.eventId) ?? []), link]);
      }
      setLoaded({
        events,
        // le note cancellate o nel cestino spariscono dal calendario
        notes: notes.filter((n) => noteRefs.has(n.noteId)),
        eventNotes,
        noteRefs,
        subjects: new Map(subjectList.map((s) => [s.id, s])),
        subjectList,
        categories: new Map(categoryList.map((c) => [c.id, c])),
        categoryList,
        spans,
      });
      setReady(true);
    })().catch((error) => console.error("Calendario: lettura non riuscita", error));
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd, version]);

  const occurrences = useMemo(() => expandEvents(loaded.events, rangeStart, rangeEnd), [loaded.events, rangeStart, rangeEnd]);

  const nowMs = now.getTime();
  const study = useMemo(() => {
    const planned = occurrences
      .filter((o) => o.event.kind === "study" && o.event.subjectId !== null)
      .map((o) => ({ key: o.key, subjectId: o.event.subjectId as number, start: o.start, end: o.end }));
    const live = liveSpan(activity.studyTimer, activity.studySubjectId, nowMs);
    const done = matchStudy(planned, live ? [...loaded.spans, live] : loaded.spans);
    const liveSubject = activity.studyTimer?.phase === "work" ? activity.studySubjectId : null;
    return new Map(
      planned.map((p): [string, StudyInfo] => {
        const seconds = done.get(p.key) ?? 0;
        return [p.key, { doneSeconds: seconds, state: studyState(p, seconds, nowMs, liveSubject) }];
      })
    );
  }, [occurrences, loaded.spans, activity.studyTimer, activity.studySubjectId, nowMs]);

  return {
    ready,
    occurrences,
    notes: loaded.notes,
    eventNotes: loaded.eventNotes,
    noteRefs: loaded.noteRefs,
    subjects: loaded.subjects,
    subjectList: loaded.subjectList,
    categories: loaded.categories,
    categoryList: loaded.categoryList,
    study,
    now,
  };
}
