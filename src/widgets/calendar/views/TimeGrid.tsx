import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import ItemChip from "../components/ItemChip";
import KindMark from "../components/KindMark";
import type { CalendarData } from "../hooks/useCalendarData";
import { usePointerDrag } from "../hooks/usePointerDrag";
import { atMinutes, clock, dayKey, isSameDay, minutesOfDay, snapMinutes, timeText } from "../lib/dates";
import { WEEKDAYS_SHORT, repeatText, studyStatusText } from "../lib/format";
import { itemColor, itemDetail, itemLabel } from "../lib/items";
import { entriesByDay, fitCell, type DayEntry } from "../lib/monthLayout";
import { isReminderDone } from "../lib/reminders";
import type { Occurrence } from "../lib/types";
import { SNAP_MIN, blockBox, layoutColumns, limitColumns, nowLineTop, rangeFromDrag, resizeRange, segmentInDay, type HourScale } from "../lib/weekLayout";
import { kindShown, type CalendarFilters } from "./filters";
import "./TimeGrid.css";

/*
 * Griglia a ore delle viste Settimana (7 colonne, 46 px per ora) e Giorno (1 colonna, 64 px per ora), come nel
 * mockup: colonna delle ore, riga "giorno" (tutto il giorno e note), blocchi per orario, linea dell'ora corrente.
 * Trascinare su uno spazio vuoto crea (un clic: un'ora), trascinare un blocco lo sposta (anche su un altro giorno),
 * il bordo basso lo allunga. Scorre in verticale su tutte le 24 ore; si apre sull'ora utile.
 */

const SCALE_FROM = 0;
/** Elementi alla stessa ora affiancati nella Settimana; dal successivo "+N". */
const WEEK_MAX_SIDE_BY_SIDE = 2;
/** Righe della riga "giorno" prima di "+N altro". */
const ALLDAY_ROWS = 3;

interface TimeGridProps {
  days: Date[];
  hourPx: number;
  variant: "week" | "day";
  data: CalendarData;
  filters: CalendarFilters;
  /** L'evento rapido di una creazione è aperto: il riquadro tratteggiato resta finché si chiude. */
  creating: boolean;
  onCreate: (day: Date, startMin: number, endMin: number, anchor: HTMLElement) => void;
  onCreateAllDay: (day: Date, anchor: HTMLElement) => void;
  onOpen: (occurrence: Occurrence, anchor: HTMLElement) => void;
  onOpenNote: (noteId: number) => void;
  onMore: (day: Date) => void;
  onChange: (occurrence: Occurrence, startAt: number, endAt: number) => void;
  /** Contenuto extra a destra nella riga "giorno" della vista Giorno (es. "+ Aggiungi"). */
  allDayExtra?: ReactNode;
}

type Preview = { key: string; day: string; startMin: number; endMin: number };
type Draft = { day: string; startMin: number; endMin: number; committed: boolean };

function TimeGrid({
  days,
  hourPx,
  variant,
  data,
  filters,
  creating,
  onCreate,
  onCreateAllDay,
  onOpen,
  onOpenNote,
  onMore,
  onChange,
  allDayExtra,
}: TimeGridProps) {
  const scale: HourScale = useMemo(() => ({ fromMin: SCALE_FROM, pxPerHour: hourPx }), [hourPx]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const colRefs = useRef(new Map<string, HTMLDivElement>());
  const draftRef = useRef<HTMLDivElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const now = data.now;

  const visible = useMemo(
    () => data.occurrences.filter((o) => kindShown(filters, o.event.kind)),
    [data.occurrences, filters]
  );
  const timed = useMemo(() => visible.filter((o) => !o.event.allDay), [visible]);
  const allDay = useMemo(
    () => entriesByDay(days, visible.filter((o) => o.event.allDay), filters.note ? data.notes : []),
    [days, visible, filters.note, data.notes]
  );

  // ---------- apertura sull'ora utile (una volta per intervallo) ----------
  const rangeKey = days.map(dayKey).join();
  const latest = useLatestRef({ days, now, timed });
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { days, now, timed } = latest.current;
    // il primo impegno (mezz'ora prima) o l'ora corrente (un'ora e mezza prima), il più presto dei due; senza nulla le 8
    const firstStart = timed.reduce((min, o) => Math.min(min, minutesOfDay(o.start)), Infinity);
    const candidates = [firstStart - 30];
    if (days.some((d) => isSameDay(d, now))) candidates.push(minutesOfDay(now) - 90);
    const best = Math.min(...candidates);
    const target = Number.isFinite(best) ? best : 8 * 60;
    el.scrollTop = Math.max(0, ((target - SCALE_FROM) / 60) * hourPx);
    // solo cambiando giorni/settimana (rangeKey), non a ogni minuto o modifica
  }, [rangeKey, hourPx, latest]);

  // ---------- creazione ----------
  // Il riquadro tratteggiato resta finché l'evento rapido aperto da lui è aperto (gli fa da àncora).
  const notified = useRef(false);
  useEffect(() => {
    if (!creating && draft?.committed && notified.current) setDraft(null);
  }, [creating, draft]);

  useEffect(() => {
    if (!draft?.committed || notified.current || !draftRef.current) return;
    notified.current = true;
    const day = days.find((d) => dayKey(d) === draft.day);
    if (day) onCreate(day, draft.startMin, draft.endMin, draftRef.current);
  }, [draft, days, onCreate]);

  const creator = usePointerDrag<{ day: string; y0: number; top: number }>({
    onStart: (it) => {
      notified.current = false;
      const r = rangeFromDrag(it.y0, it.y0, scale);
      setDraft({ day: it.day, ...r, committed: false });
    },
    onMove: (it, _x, y) => setDraft({ day: it.day, ...rangeFromDrag(it.y0, y - it.top, scale), committed: false }),
    onEnd: (it, _x, y) => setDraft({ day: it.day, ...rangeFromDrag(it.y0, y - it.top, scale), committed: true }),
    onCancel: () => setDraft(null),
  });

  function onColumnPointerDown(day: string, e: ReactPointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const top = e.currentTarget.getBoundingClientRect().top;
    creator.onPointerDown({ day, y0: e.clientY - top, top }, e);
  }

  function onColumnClick(day: string, e: MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || creator.shouldIgnoreClick() || mover.shouldIgnoreClick()) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    notified.current = false;
    setDraft({ day, ...rangeFromDrag(y, y, scale), committed: true });
  }

  // ---------- spostare e allungare ----------
  const columnAt = (x: number): string | null => {
    for (const [key, el] of colRefs.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x < r.right) return key;
    }
    return null;
  };

  const previewRef = useLatestRef(preview);

  const mover = usePointerDrag<Occurrence>({
    onMove: (o, x, _y, _dx, dy) => {
      const start = minutesOfDay(o.start);
      const duration = (o.end - o.start) / 60_000;
      const s = Math.max(0, Math.min(snapMinutes(start + (dy / hourPx) * 60, SNAP_MIN), 1440 - SNAP_MIN));
      setPreview({ key: o.key, day: columnAt(x) ?? dayKey(o.start), startMin: s, endMin: s + duration });
    },
    onEnd: (o) => {
      const p = previewRef.current;
      setPreview(null);
      if (!p || p.key !== o.key) return;
      const day = days.find((d) => dayKey(d) === p.day);
      if (!day) return;
      const startAt = atMinutes(day, p.startMin);
      if (startAt !== o.start) onChange(o, startAt, startAt + (o.end - o.start));
    },
    onCancel: () => setPreview(null),
  });

  const resizer = usePointerDrag<Occurrence>({
    onMove: (o, _x, _y, _dx, dy) => {
      const seg = segmentInDay(o.start, o.end, o.start);
      if (!seg) return;
      const r = resizeRange(seg.startMin, seg.endMin, (dy / hourPx) * 60);
      setPreview({ key: o.key, day: dayKey(o.start), ...r });
    },
    onEnd: (o) => {
      const p = previewRef.current;
      setPreview(null);
      if (!p || p.key !== o.key) return;
      const endAt = atMinutes(o.start, p.endMin);
      if (endAt !== o.end) onChange(o, o.start, endAt);
    },
    onCancel: () => setPreview(null),
  });

  // ---------- disegno ----------

  function renderBlock(o: Occurrence, startMin: number, endMin: number, col: { col: number; cols: number }, ghost: boolean) {
    const { top, height } = blockBox(startMin, endMin, scale);
    const kind = o.event.kind;
    const color = itemColor(o, data);
    const study = kind === "study" ? data.study.get(o.key) : undefined;
    const isReminder = kind === "reminder";
    const reminderDone = isReminderDone(o);
    const plannedSeconds = (o.end - o.start) / 1000;
    const label = itemLabel(o, data);
    const detail = itemDetail(o, data);
    // il promemoria è un'ora sola (il blocco è alto REMINDER_SPAN_MIN solo per potersi vedere e prendere)
    const range = isReminder ? timeText(startMin) : `${timeText(startMin)} – ${endMin >= 1440 ? "24:00" : timeText(endMin)}`;
    const status = study ? studyStatusText(study.state, study.doneSeconds, plannedSeconds) : reminderDone ? "Fatto" : "";
    const repeat = repeatText(o.event.repeat, o.start);
    // Sovrapposti: affiancati, ognuno nella sua parte di colonna (nei blocchi stretti il nome va a capo, vedi CSS).
    const style = {
      top,
      height,
      left: `calc(${(col.col / col.cols) * 100}% + 4px)`,
      width: `calc(${100 / col.cols}% - 10px)`,
      ...(color ? { "--item": color } : {}),
    } as CSSProperties;
    const running = study?.state === "running";
    const dayLine = [range, kind === "study" ? detail : isReminder ? o.event.description.trim().split("\n")[0] || repeat : repeat]
      .filter(Boolean)
      .join(" · ");
    return (
      <div
        key={ghost ? `ghost-${o.key}` : o.key}
        className={`cal-block cal-block--${kind} cal-block--${variant}${study ? ` cal-block--${study.state}` : ""}${reminderDone ? " cal-block--done" : ""}${
          ghost ? " cal-block--ghost" : ""
        }${preview?.key === o.key && !ghost ? " cal-block--moving" : ""}${height < 40 ? " cal-block--short" : ""}`}
        style={style}
        title={`${label}
${range}${status ? `
${status}` : ""}`}
      >
        <button
          type="button"
          className="cal-block-body"
          aria-label={`${label}, ${range}${status ? `, ${status}` : ""}`}
          onPointerDown={(e) => mover.onPointerDown(o, e)}
          onClick={(e) => {
            if (mover.shouldIgnoreClick() || resizer.shouldIgnoreClick()) return;
            onOpen(o, e.currentTarget);
          }}
        >
          {variant === "week" ? (
            <>
              <b className="cal-block-title">
                <KindMark kind={kind} filled={study?.state === "done" || reminderDone} />
                {label}
              </b>
              {(kind !== "study" || !running) && <span className="cal-block-line cal-block-line--range">{range}</span>}
              {status && <span className="cal-block-line">{status}</span>}
            </>
          ) : (
            <>
              {/* Giorno: lo stato sta nella pillola a destra del nome; se il blocco è stretto (sovrapposizioni)
                  la pillola sparisce e lo stato va in fondo alla riga sotto (container query nel CSS). */}
              <span className="cal-block-head">
                <b className="cal-block-title">
                  <KindMark kind={kind} filled={study?.state === "done" || reminderDone} />
                  {label}
                </b>
                {status && <span className={`cal-block-pill${running ? " cal-block-pill--on" : ""}`}>{status}</span>}
              </span>
              <span className="cal-block-line">
                {dayLine}
                {status && <span className="cal-block-status-inline"> · {status}</span>}
              </span>
            </>
          )}
        </button>
        {/* Note collegate all'elemento (vista Giorno, se il blocco ha posto): fuori dal pulsante, si aprono da sole. */}
        {variant === "day" && !ghost && height >= 84 && (data.eventNotes.get(o.event.id) ?? []).length > 0 && (
          <div className="cal-block-notes">
            {(data.eventNotes.get(o.event.id) ?? []).map((link) => (
              <ItemChip
                key={link.id}
                kind="note"
                label={data.noteRefs.get(link.noteId)?.title || "Nota senza titolo"}
                onClick={() => onOpenNote(link.noteId)}
              />
            ))}
          </div>
        )}
        {!ghost && !isReminder && isSameDay(o.start, o.end - 1) && (
          <span
            className="cal-block-resize"
            aria-hidden="true"
            onPointerDown={(e) => {
              e.stopPropagation();
              resizer.onPointerDown(o, e);
            }}
          />
        )}
      </div>
    );
  }

  function renderAllDayEntry(entry: DayEntry) {
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
    return (
      <ItemChip
        key={o.key}
        kind={o.event.kind}
        label={itemLabel(o, data)}
        color={itemColor(o, data)}
        studyState={o.event.kind === "study" ? data.study.get(o.key)?.state : undefined}
        done={isReminderDone(o)}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(o, e.currentTarget);
        }}
      />
    );
  }

  const allDayRows = Math.min(ALLDAY_ROWS, Math.max(1, ...days.map((d) => (allDay.get(dayKey(d)) ?? []).length)));
  const showsToday = days.some((d) => isSameDay(d, now));
  const nowTop = nowLineTop(now, scale);
  const gridStyle = { "--hour-px": `${hourPx}px`, "--cols": days.length, "--allday-rows": allDayRows } as CSSProperties;

  return (
    <div className={`cal-tg cal-tg--${variant}`} style={gridStyle}>
      <div className="cal-tg-scroll" ref={scrollRef}>
        <div className="cal-tg-sticky">
          {variant === "week" && (
            <div className="cal-tg-row cal-tg-days">
              <div />
              {days.map((d) => {
                const today = isSameDay(d, now);
                return (
                  <div key={dayKey(d)} className={`cal-tg-dayhead${today ? " cal-tg-dayhead--today" : ""}`}>
                    <span className="cal-tg-dayname">{WEEKDAYS_SHORT[(d.getDay() + 6) % 7]}</span>
                    {today ? (
                      <span className="cal-tg-daynum cal-tg-daynum--today" aria-label={`${d.getDate()}, oggi`}>
                        {d.getDate()}
                      </span>
                    ) : (
                      <span className="cal-tg-daynum">{d.getDate()}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="cal-tg-row cal-tg-allday">
            <div className="cal-tg-allday-label">giorno</div>
            {days.map((d) => {
              const key = dayKey(d);
              const { shown, more } = fitCell(allDay.get(key) ?? [], variant === "day" ? 99 : ALLDAY_ROWS);
              return (
                <div
                  key={key}
                  className={`cal-tg-allday-cell${isSameDay(d, now) && variant === "week" ? " cal-tg-col--today" : ""}`}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) onCreateAllDay(d, e.currentTarget);
                  }}
                >
                  {shown.map(renderAllDayEntry)}
                  {more > 0 && (
                    <button type="button" className="cal-month-more" onClick={() => onMore(d)}>
                      +{more} altro
                    </button>
                  )}
                  {variant === "day" && allDayExtra}
                </div>
              );
            })}
          </div>
        </div>

        <div className="cal-tg-row cal-tg-body">
          <div className="cal-tg-hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => {
              // l'etichetta è centrata sulla linea della sua ora; sparisce sotto l'etichetta dell'ora corrente
              const hidden = showsToday && Math.abs(nowTop + 1 - h * hourPx) < 16;
              return (
                <div key={h} className="cal-tg-hour">
                  {h > 0 && !hidden && <span>{timeText(h * 60)}</span>}
                </div>
              );
            })}
            {showsToday && (
              <span className="cal-tg-now-pill" style={{ top: nowTop - 7 }}>
                {clock(now)}
              </span>
            )}
          </div>

          {days.map((d) => {
            const key = dayKey(d);
            const today = isSameDay(d, now);
            const segments = timed.flatMap((o) => {
              const seg = segmentInDay(o.start, o.end, d);
              if (!seg) return [];
              return [{ o, startMin: seg.startMin, endMin: o.event.kind === "reminder" ? reminderEnd(seg.startMin) : seg.endMin }];
            });
            const items = segments.map((s) => ({ key: s.o.key, startMin: s.startMin, endMin: s.endMin }));
            // Settimana: al massimo 2 affiancati, dal terzo "+N" che apre il giorno; Giorno: tutti affiancati
            const { placed: cols, overflow } =
              variant === "week" ? limitColumns(items, WEEK_MAX_SIDE_BY_SIDE) : { placed: layoutColumns(items), overflow: [] };
            const moving = preview && preview.day === key ? timed.find((o) => o.key === preview.key) : undefined;
            return (
              <div
                key={key}
                ref={(el) => {
                  if (el) colRefs.current.set(key, el);
                  else colRefs.current.delete(key);
                }}
                data-cal-col={key}
                className={`cal-tg-col${today && variant === "week" ? " cal-tg-col--today" : ""}`}
                onPointerDown={(e) => onColumnPointerDown(key, e)}
                onClick={(e) => onColumnClick(key, e)}
              >
                {segments.map((s) => {
                  const slot = cols.get(s.o.key);
                  return slot ? renderBlock(s.o, s.startMin, s.endMin, slot, false) : null;
                })}
                {overflow.map((h) => (
                  <button
                    key={`more${h.group}`}
                    type="button"
                    className="cal-tg-more"
                    style={{ top: blockBox(h.startMin, h.startMin + 30, scale).top + 2 }}
                    aria-label={`Altri ${h.count} elementi alle ${timeText(h.startMin)}: apri il giorno`}
                    onClick={() => onMore(d)}
                  >
                    +{h.count}
                  </button>
                ))}
                {moving &&
                  preview &&
                  renderBlock(
                    moving,
                    preview.startMin,
                    moving.event.kind === "reminder" ? reminderEnd(preview.startMin) : Math.min(preview.endMin, 1440),
                    { col: 0, cols: 1 },
                    true
                  )}
                {draft && draft.day === key && (
                  <div
                    ref={draftRef}
                    className="cal-block cal-block--draft"
                    style={{ ...blockBox(draft.startMin, draft.endMin, scale), left: 4, right: 6 }}
                  >
                    <b>+ Nuovo</b>
                    <span>
                      {timeText(draft.startMin)} – {draft.endMin >= 1440 ? "24:00" : timeText(draft.endMin)}
                    </span>
                  </div>
                )}
                {today && <div className="cal-tg-now" style={{ top: nowTop }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Quanto è alto (in minuti) il blocco di un promemoria, che dura zero: abbastanza per leggerlo e prenderlo. */
const REMINDER_SPAN_MIN = 30;

function reminderEnd(startMin: number): number {
  return Math.min(startMin + REMINDER_SPAN_MIN, 1440);
}

export default TimeGrid;
