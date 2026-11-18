import { useEffect, useState, type CSSProperties } from "react";
import { getStudySpansBetween, type SubjectRef } from "../../../core/study/studyReadRepository";
import { listLinkedSessions } from "../data/calendarRepository";
import { onCalendarChanged } from "../data/calendarChanges";
import { clock, durationText } from "../lib/dates";
import { WEEKDAYS_SHORT } from "../lib/format";
import { STUDY_MARGIN_MS, matchStudy } from "../lib/studyProgress";
import type { CalendarEvent } from "../lib/types";
import KindMark from "../components/KindMark";

/*
 * "Sessioni di studio collegate" (mockup): le sessioni pianificate per questo evento (parent_id), con lo studio fatto
 * in ciascuna e il totale; "+ Pianifica una sessione" ne crea una nuova collegata.
 */

interface LinkedSessionsProps {
  eventId: number;
  subjects: ReadonlyMap<number, SubjectRef>;
  now: number;
  onOpen: (session: CalendarEvent) => void;
  onPlan: (anchor: HTMLElement) => void;
}

function LinkedSessions({ eventId, subjects, now, onOpen, onPlan }: LinkedSessionsProps) {
  const [rows, setRows] = useState<{ session: CalendarEvent; done: number }[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => onCalendarChanged(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessions = (await listLinkedSessions(eventId)).filter((s) => s.kind === "study" && s.subjectId !== null);
      if (sessions.length === 0) {
        if (!cancelled) setRows([]);
        return;
      }
      const from = Math.min(...sessions.map((s) => s.startAt)) - STUDY_MARGIN_MS;
      const to = Math.max(...sessions.map((s) => s.endAt)) + STUDY_MARGIN_MS;
      const spans = await getStudySpansBetween(from, to);
      const done = matchStudy(
        sessions.map((s) => ({ key: String(s.id), subjectId: s.subjectId as number, start: s.startAt, end: s.endAt })),
        spans
      );
      if (!cancelled) setRows(sessions.map((session) => ({ session, done: done.get(String(session.id)) ?? 0 })));
    })().catch((error) => console.error("Calendario: sessioni collegate non lette", error));
    return () => {
      cancelled = true;
    };
  }, [eventId, version]);

  const total = rows.reduce((sum, r) => sum + r.done, 0);
  return (
    <div className="cal-linked">
      <div className="cal-linked-head">
        <h2 className="cal-panel-h2">Sessioni di studio collegate</h2>
        {total > 0 && <span className="cal-linked-total">{durationText(total)} fatte</span>}
      </div>
      {rows.map(({ session, done }) => {
        const subject = session.subjectId === null ? undefined : subjects.get(session.subjectId);
        const planned = (session.endAt - session.startAt) / 1000;
        const d = new Date(session.startAt);
        return (
          <button
            key={session.id}
            type="button"
            className="cal-linked-row"
            style={subject ? ({ "--item": subject.color } as CSSProperties) : undefined}
            onClick={() => onOpen(session)}
          >
            <span>
              <KindMark kind="study" filled={done >= 60} />
              {WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} {d.getDate()} · {clock(session.startAt)}
              {subject ? ` · ${subject.name}` : ""}
            </span>
            <span className="cal-linked-sub">
              {done > 0 ? `${durationText(done)} su ${durationText(planned)}` : session.endAt < now ? "Non fatta" : `In programma · ${durationText(planned)}`}
            </span>
          </button>
        );
      })}
      <button type="button" className="cal-btn-ghost cal-linked-plan" onClick={(e) => onPlan(e.currentTarget)}>
        + Pianifica una sessione
      </button>
    </div>
  );
}

export default LinkedSessions;
