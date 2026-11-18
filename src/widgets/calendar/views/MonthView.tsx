import { useMemo, useState, type MouseEvent } from "react";
import { useElementSize } from "../../../core/hooks/useElementSize";
import ItemChip from "../components/ItemChip";
import type { CalendarData } from "../hooks/useCalendarData";
import { usePointerDrag } from "../hooks/usePointerDrag";
import { clock, dayKey, isSameDay, monthGrid } from "../lib/dates";
import { WEEKDAYS_SHORT, cellDayLabel, MONTHS } from "../lib/format";
import { itemColor, itemLabel } from "../lib/items";
import { entriesByDay, fitCell, rowsThatFit, type DayEntry } from "../lib/monthLayout";
import { isReminderDone } from "../lib/reminders";
import type { Occurrence } from "../lib/types";
import { kindShown, type CalendarFilters } from "./filters";
import "./MonthView.css";

/*
 * Vista mese (mockup: "Vista mese"): griglia lun → dom, 6 righe; al massimo 3 righe per giorno, poi "+N altro";
 * oggi = numero in pillola accent; giorni fuori mese più spenti. Clic su uno spazio vuoto = nuovo elemento quel
 * giorno; un elemento si trascina su un altro giorno (stessa ora).
 */

interface MonthViewProps {
  year: number;
  month: number;
  data: CalendarData;
  filters: CalendarFilters;
  onCreate: (day: Date, anchor: HTMLElement) => void;
  onOpen: (occurrence: Occurrence, anchor: HTMLElement) => void;
  onOpenNote: (noteId: number) => void;
  onMore: (day: Date) => void;
  onMove: (occurrence: Occurrence, day: Date) => void;
}

function MonthView({ year, month, data, filters, onCreate, onOpen, onOpenNote, onMore, onMove }: MonthViewProps) {
  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const [drag, setDrag] = useState<{ key: string; overDay: string | null } | null>(null);
  // Quante righe entrano davvero in una cella (6 righe di celle con 1 px tra l'una e l'altra).
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const bodySize = useElementSize(body);
  const rows = bodySize.height > 0 ? rowsThatFit((bodySize.height - 5) / 6) : 3;

  const visible = useMemo(
    () => data.occurrences.filter((o) => kindShown(filters, o.event.kind)),
    [data.occurrences, filters]
  );
  const byDay = useMemo(
    () => entriesByDay(days, visible, filters.note ? data.notes : []),
    [days, visible, filters.note, data.notes]
  );

  const dayUnder = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest("[data-cal-day]") as HTMLElement | null)?.dataset.calDay ?? null;

  const dragger = usePointerDrag<Occurrence>({
    onStart: (o) => setDrag({ key: o.key, overDay: dayKey(o.start) }),
    onMove: (_o, x, y) => setDrag((d) => (d ? { ...d, overDay: dayUnder(x, y) } : d)),
    onEnd: (o, x, y) => {
      setDrag(null);
      const target = dayUnder(x, y);
      const day = days.find((d) => dayKey(d) === target);
      if (day && !isSameDay(day, o.start)) onMove(o, day);
    },
    onCancel: () => setDrag(null),
  });

  function renderEntry(entry: DayEntry) {
    if (entry.kind === "note") {
      const ref = data.noteRefs.get(entry.link.noteId);
      return (
        <ItemChip
          key={`n${entry.link.id}`}
          kind="note"
          label={ref?.title || "Nota senza titolo"}
          onClick={(e) => {
            e.stopPropagation();
            onOpenNote(entry.link.noteId);
          }}
        />
      );
    }
    const o = entry.occurrence;
    const startsHere = !o.event.allDay;
    return (
      <ItemChip
        key={o.key}
        kind={o.event.kind}
        label={itemLabel(o, data)}
        time={startsHere ? clock(o.start) : undefined}
        color={itemColor(o, data)}
        studyState={o.event.kind === "study" ? data.study.get(o.key)?.state : undefined}
        done={isReminderDone(o)}
        dragging={drag?.key === o.key}
        onPointerDown={(e) => dragger.onPointerDown(o, e)}
        onClick={(e) => {
          e.stopPropagation();
          if (dragger.shouldIgnoreClick()) return;
          onOpen(o, e.currentTarget);
        }}
      />
    );
  }

  const today = data.now;
  const showsToday = today.getFullYear() === year && today.getMonth() === month;
  return (
    <div className="cal-month" role="grid" aria-label={`${MONTHS[month]} ${year}`}>
      <div className="cal-month-head" role="row">
        {WEEKDAYS_SHORT.map((d, i) => (
          <div
            key={d}
            role="columnheader"
            className={showsToday && (today.getDay() + 6) % 7 === i ? "cal-month-head--today" : undefined}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="cal-month-body" ref={setBody}>
        {days.map((day) => {
          const key = dayKey(day);
          const entries = byDay.get(key) ?? [];
          const { shown, more } = fitCell(entries, rows);
          const outside = day.getMonth() !== month;
          const isToday = isSameDay(day, today);
          return (
            <div
              key={key}
              role="gridcell"
              data-cal-day={key}
              className={`cal-month-cell${outside ? " cal-month-cell--out" : ""}${isToday ? " cal-month-cell--today" : ""}${
                drag && drag.overDay === key ? " cal-month-cell--drop" : ""
              }`}
              onClick={(e: MouseEvent<HTMLDivElement>) => {
                if (dragger.shouldIgnoreClick()) return;
                onCreate(day, e.currentTarget);
              }}
            >
              {isToday ? (
                <span className="cal-month-num cal-month-num--today" aria-label={`${day.getDate()}, oggi`}>
                  {day.getDate()}
                </span>
              ) : (
                <span className="cal-month-num">{cellDayLabel(day)}</span>
              )}
              {shown.map(renderEntry)}
              {more > 0 && (
                <button
                  type="button"
                  className="cal-month-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMore(day);
                  }}
                >
                  +{more} altro
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MonthView;
