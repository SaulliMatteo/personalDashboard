import { useEffect } from "react";
import { emitActivityEvent, getActivity, subscribeActivityEvents } from "../../../core/activity/activityBus";
import { sendAppNotification } from "../../../core/notify/notifier";
import { getStudySpansBetween, listActiveSubjects, type StudySpan, type SubjectRef } from "../../../core/study/studyReadRepository";
import { onSyncApplied } from "../../../core/sync/syncEvents";
import { listCategories, listEventsInRange, loadReminderCheck, saveReminderCheck } from "../data/calendarRepository";
import { notifyCalendarChanged, onCalendarChanged } from "../data/calendarChanges";
import { calendarCues } from "../lib/cues";
import { HOUR, MINUTE } from "../lib/dates";
import { itemLabel, type ItemLookups } from "../lib/items";
import { expandEvents } from "../lib/recurrence";
import { REMINDER_HORIZON_MS, dueReminders, reminderBody } from "../lib/reminders";
import { STUDY_MARGIN_MS, liveSpan, matchStudy } from "../lib/studyProgress";
import type { CalendarEvent } from "../lib/types";

/*
 * Il Calendario mentre l'app è aperta (montato dal provider del widget, anche se il widget non è in dashboard):
 * - manda i promemoria all'ora giusta e, all'apertura, quelli scaduti ad app chiusa se l'impegno non è ancora
 *   iniziato (`calendar_reminders_checked_at` nei metadati). Solo desktop: su Android non si pianifica nulla.
 * - quando il sync porta elementi del calendario da un altro dispositivo, fa rileggere tutti (notifyCalendarChanged).
 * - dice al Companion (bus delle attività) quando un impegno sta per iniziare, quando una sessione pianificata non
 *   parte e quando è completata, una volta per occorrenza.
 */

const TICK_MS = 20_000;
/** Ogni quanto si rileggono comunque i dati (la finestra avanza, lo studio fatto cresce). */
const RELOAD_MS = 5 * MINUTE;
/** Quanto indietro guardare: le sessioni pianificate di poco fa servono ancora per "completata". */
const LOOKBACK_MS = 24 * HOUR;

interface Snapshot {
  events: CalendarEvent[];
  spans: StudySpan[];
  lookups: ItemLookups;
  loadedAt: number;
}

async function load(now: number): Promise<Snapshot> {
  const from = now - LOOKBACK_MS;
  const [events, spans, subjects, categories] = await Promise.all([
    listEventsInRange(from, now + REMINDER_HORIZON_MS),
    getStudySpansBetween(from - STUDY_MARGIN_MS, now + STUDY_MARGIN_MS),
    listActiveSubjects(),
    listCategories(),
  ]);
  return {
    events,
    spans,
    lookups: {
      subjects: new Map<number, SubjectRef>(subjects.map((s) => [s.id, s])),
      categories: new Map(categories.map((c) => [c.id, c])),
    },
    loadedAt: now,
  };
}

export function useCalendarWatch(): void {
  useEffect(() => {
    let disposed = false;
    let running = false;
    let again = false;
    let dirty = true;
    let data: Snapshot | null = null;
    let lastCheck: number | null | undefined;
    // momenti già detti al Companion (solo memoria: a ogni avvio si riparte)
    const told = new Set<string>();
    let primed = false;

    async function tick() {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        const now = Date.now();
        if (lastCheck === undefined) lastCheck = await loadReminderCheck();
        if (dirty || !data || now - data.loadedAt > RELOAD_MS) {
          dirty = false;
          data = await load(now);
        }
        if (disposed) return;
        const occurrences = expandEvents(data.events, now - LOOKBACK_MS, now + REMINDER_HORIZON_MS);
        const lookups = data.lookups;
        const label = (o: (typeof occurrences)[number]) => itemLabel(o, lookups);

        for (const r of dueReminders(occurrences, lastCheck, now)) {
          void sendAppNotification({
            kind: "calendarReminder",
            title: label(r.occurrence),
            body: reminderBody(r.occurrence, now),
            open: { type: "widget", widgetId: "calendar" },
          });
          emitActivityEvent({ type: "calendarReminder", title: label(r.occurrence) });
        }
        lastCheck = now;
        await saveReminderCheck(now);

        const activity = getActivity();
        const planned = occurrences
          .filter((o) => o.event.kind === "study" && o.event.subjectId !== null)
          .map((o) => ({ key: o.key, subjectId: o.event.subjectId as number, start: o.start, end: o.end }));
        const live = liveSpan(activity.studyTimer, activity.studySubjectId, now);
        const doneSeconds = matchStudy(planned, live ? [...data.spans, live] : data.spans);
        const cues = calendarCues({
          occurrences,
          doneSeconds,
          // timer avviato su quella materia (anche in pausa): la sessione non è "saltata"
          liveSubjectId: activity.studyTimer ? activity.studySubjectId : null,
          label,
          now,
        });
        for (const cue of cues) {
          if (told.has(cue.key)) continue;
          told.add(cue.key);
          // all'avvio non si festeggiano sessioni già completate prima di aprire l'app
          if (!primed && cue.type === "plannedStudyDone") continue;
          if (cue.type === "calendarSoon") emitActivityEvent({ type: "calendarSoon", title: cue.title, minutes: cue.minutes });
          else if (cue.type === "plannedStudyMissed") emitActivityEvent({ type: "plannedStudyMissed", title: cue.title });
          else emitActivityEvent({ type: "plannedStudyDone", title: cue.title, minutes: cue.minutes });
        }
        primed = true;
      } catch (error) {
        console.error("Calendario: controllo dei promemoria non riuscito", error);
      } finally {
        running = false;
        if (again && !disposed) {
          again = false;
          void tick();
        }
      }
    }

    const refresh = () => {
      dirty = true;
      void tick();
    };
    const offChanged = onCalendarChanged(refresh);
    const offSync = onSyncApplied(({ kinds }) => {
      // elementi del calendario arrivati da un altro dispositivo: rileggono tutti (pagina, card, mini, pannello e
      // questo controllo, che ascolta onCalendarChanged)
      if ([...kinds].some((k) => k.startsWith("calendar_"))) notifyCalendarChanged();
      else if (kinds.has("subject") || kinds.has("session")) refresh();
    });
    const offActivity = subscribeActivityEvents((e) => {
      if (e.type === "studyStopped") refresh();
    });
    void tick();
    const timer = window.setInterval(() => void tick(), TICK_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      offChanged();
      offSync();
      offActivity();
    };
  }, []);
}
