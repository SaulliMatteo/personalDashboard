import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdAdd, MdChevronLeft, MdChevronRight, MdExpandMore } from "react-icons/md";
import { useNav } from "../../core/nav/useNav";
import { peekWidgetIntent, requestWidgetIntent, takeWidgetIntent } from "../../core/nav/intents";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import BackButton from "../../ui/BackButton";
import KindMark from "./components/KindMark";
import MonthPicker from "./components/MonthPicker";
import QuickEventPopover, { type QuickDraft } from "./components/QuickEventPopover";
import SeriesScopeDialog from "./components/SeriesScopeDialog";
import LinkNoteButton from "./components/LinkNoteButton";
import { linkNote } from "./data/noteLinkOps";
import EventPanel, { type PanelTarget } from "./panel/EventPanel";
import { blankEvent, loadLastView, saveLastView } from "./data/calendarRepository";
import { addEvent, changeOccurrence, deleteOccurrence, type SeriesScope } from "./data/occurrenceOps";
import { useCalendarData } from "./hooks/useCalendarData";
import { addDays, dayKey, defaultStartMinutes, durationText, monthGrid, startOfDay, startOfWeek, weekDays } from "./lib/dates";
import { useCompact } from "../../core/layout/useCompact";
import { dayTitle, monthTitle, weekTitle } from "./lib/format";
import { shiftInstant, wallDelta } from "./lib/recurrence";
import type { CalendarEvent, CalendarView, ItemKind, Occurrence } from "./lib/types";
import MonthView from "./views/MonthView";
import TimeGrid from "./views/TimeGrid";
import DaySidebar from "./views/DaySidebar";
import { DAY_HOUR_PX, WEEK_HOUR_PX } from "./lib/weekLayout";
import { ALL_FILTERS, type CalendarFilters } from "./views/filters";
import "./components/controls.css";
import "./CalendarDetail.css";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "month", label: "Mese" },
  { id: "week", label: "Settimana" },
  { id: "day", label: "Giorno" },
];

const STEP_LABEL: Record<CalendarView, [string, string]> = {
  month: ["Mese precedente", "Mese successivo"],
  week: ["Settimana precedente", "Settimana successiva"],
  day: ["Giorno precedente", "Giorno successivo"],
};

/** L'intervallo che la vista mostra: [inizio, fine). */
function viewRange(view: CalendarView, cursor: Date): [number, number] {
  if (view === "month") {
    const grid = monthGrid(cursor.getFullYear(), cursor.getMonth());
    return [grid[0].getTime(), addDays(grid[41], 1).getTime()];
  }
  if (view === "week") {
    const monday = startOfWeek(cursor);
    return [monday.getTime(), addDays(monday, 7).getTime()];
  }
  // il giorno e quello dopo (la card "Domani")
  const day = startOfDay(cursor);
  return [day.getTime(), addDays(day, 2).getTime()];
}

function step(view: CalendarView, cursor: Date, dir: 1 | -1): Date {
  if (view === "month") return new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
  return addDays(startOfDay(cursor), view === "week" ? 7 * dir : dir);
}

/** Evento rapido (solo per creare: un elemento esistente si apre nel pannello). */
type QuickState = {
  day: Date;
  startMin: number;
  endMin: number;
  allDay: boolean;
  kind?: ItemKind;
  subjectId?: number | null;
  /** Sessione pianificata per un evento ("+ Pianifica una sessione" del pannello). */
  parentId?: number;
};

type ScopeState = { action: "change" | "delete"; run: (scope: SeriesScope) => Promise<void> };

/** Pagina del Calendario: viste Mese, Settimana e Giorno, filtri per tipo, evento rapido. */
function CalendarDetail() {
  const { goToDashboard, openWidgetDetail } = useNav();
  // Richiesta dalle card ("Sett.", "Giorno", "+ Nuovo"): letta all'apertura, consumata subito dopo.
  const [intent] = useState(() => peekWidgetIntent("calendar"));
  const [view, setView] = useState<CalendarView | null>(() => (intent?.type === "openView" ? intent.view : null));
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [filters, setFilters] = useState<CalendarFilters>(ALL_FILTERS);
  const [quick, setQuick] = useState<QuickState | null>(null);
  const [scope, setScope] = useState<ScopeState | null>(null);
  const [panel, setPanel] = useState<PanelTarget | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const anchorRef = useRef<HTMLElement | null>(null);
  const newButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleRef = useRef<HTMLButtonElement | null>(null);
  const [picking, setPicking] = useState(false);

  // L'ultima vista usata (per dispositivo): finché non arriva non si disegna nulla, per non saltare da una all'altra.
  useEffect(() => {
    takeWidgetIntent("calendar");
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (intent?.type === "openView") {
      // la vista chiesta dalla card è già quella iniziale: diventa anche l'ultima usata
      saveLastView(intent.view).catch((error) => console.error("Calendario: vista non salvata", error));
      return;
    }
    loadLastView()
      .then((v) => !cancelled && setView(v))
      .catch(() => !cancelled && setView("month"));
    return () => {
      cancelled = true;
    };
  }, [intent]);

  // Sul telefono (layout compatto) solo la vista Giorno: il Calendario per ora è pensato per il desktop.
  const compact = useCompact();
  const shownView: CalendarView = compact ? "day" : (view ?? "month");
  const [rangeStart, rangeEnd] = useMemo(() => viewRange(shownView, cursor), [shownView, cursor]);
  const data = useCalendarData(rangeStart, rangeEnd);

  // "+ Nuovo" della card: appena la pagina è pronta, l'evento rapido si apre sotto il suo "+ Nuovo".
  const openNewRef = useLatestRef(() => newButtonRef.current && openNew(newItemDay(), newButtonRef.current));
  const newDone = useRef(false);
  useEffect(() => {
    if (intent?.type !== "new" || newDone.current || view === null || !data.ready) return;
    newDone.current = true;
    openNewRef.current();
  }, [intent, view, data.ready, openNewRef]);

  function chooseView(next: CalendarView) {
    setView(next);
    saveLastView(next).catch((error) => console.error("Calendario: vista non salvata", error));
  }

  // ---------- creare, modificare, spostare ----------

  function openNew(day: Date, anchor: HTMLElement, startMin?: number, endMin?: number, allDay = false, extra?: Partial<QuickState>) {
    anchorRef.current = anchor;
    const s = startMin ?? defaultStartMinutes(day, data.now);
    setQuick({ day: startOfDay(day), startMin: s, endMin: endMin ?? Math.min(s + 60, 1440), allDay, ...extra });
  }

  /** Un elemento esistente si apre nel pannello (per una serie: proprio quell'occorrenza). */
  function openEdit(occurrence: Occurrence) {
    setQuick(null);
    setPanel({ eventId: occurrence.event.id, occStart: occurrence.recurring ? occurrence.start : null });
  }

  /** Per una serie chiede "solo questa / tutte", altrimenti esegue subito. */
  function withScope(occurrence: Occurrence, action: "change" | "delete", run: (scope: SeriesScope) => Promise<void>) {
    const fail = (error: unknown) => console.error("Calendario: modifica non riuscita", error);
    if (occurrence.recurring) setScope({ action, run: (s) => run(s).catch(fail) });
    else run("all").catch(fail);
  }

  function create(draft: QuickDraft): Promise<number> {
    const parentId = quick?.parentId ?? null;
    setQuick(null);
    return addEvent({
      ...blankEvent(draft.kind, draft.startAt, draft.endAt),
      title: draft.title,
      subjectId: draft.subjectId,
      allDay: draft.allDay,
      description: draft.description,
      parentId,
    });
  }

  function save(draft: QuickDraft) {
    create(draft).catch((error) => console.error("Calendario: elemento non creato", error));
  }

  /** "Personalizza": crea l'elemento e lo apre nel pannello. */
  function customize(draft: QuickDraft) {
    create(draft)
      .then((id) => setPanel({ eventId: id, occStart: null }))
      .catch((error) => console.error("Calendario: elemento non creato", error));
  }

  function removeFromPanel(occ: Occurrence) {
    withScope(occ, "delete", (s) => deleteOccurrence(occ, s).then(closePanel));
  }

  /** "+ Pianifica una sessione" del pannello: il giorno prima dell'evento (o oggi, se è già passato). */
  function planSession(parent: CalendarEvent, anchor: HTMLElement) {
    const dayBefore = addDays(startOfDay(parent.startAt), -1);
    const day = dayBefore.getTime() < startOfDay(data.now).getTime() ? startOfDay(data.now) : dayBefore;
    openNew(day, anchor, undefined, undefined, false, { kind: "study", subjectId: parent.subjectId, parentId: parent.id });
  }

  function moveToDay(occ: Occurrence, day: Date) {
    const { days } = wallDelta(startOfDay(occ.start).getTime(), startOfDay(day).getTime());
    const startAt = shiftInstant(occ.start, days, 0);
    const endAt = shiftInstant(occ.end, days, 0);
    withScope(occ, "change", (s) => changeOccurrence(occ, { startAt, endAt }, s));
  }

  /** "+ Nuovo": oggi se la vista lo mostra (nel mese: il mese di oggi), altrimenti il giorno guardato. */
  function newItemDay(): Date {
    const now = data.now;
    const showsToday =
      shownView === "month"
        ? now.getMonth() === cursor.getMonth() && now.getFullYear() === cursor.getFullYear()
        : now.getTime() >= rangeStart && now.getTime() < rangeEnd;
    return showsToday ? now : cursor;
  }

  function openNote(noteId: number) {
    requestWidgetIntent("notes", { type: "openNote", noteId });
    openWidgetDetail("notes");
  }

  // ---------- intestazione ----------

  const title =
    shownView === "month" ? monthTitle(cursor.getFullYear(), cursor.getMonth()) : shownView === "week" ? weekTitle(cursor) : dayTitle(cursor);

  const summary = useMemo(() => {
    if (shownView === "week") {
      const sessions = data.occurrences.filter((o) => o.event.kind === "study");
      const planned = sessions.reduce((sum, o) => sum + (o.end - o.start) / 1000, 0);
      const done = sessions.reduce((sum, o) => sum + (data.study.get(o.key)?.doneSeconds ?? 0), 0);
      return { text: `Studio: ${durationText(done)} fatte su ${durationText(planned)} in programma`, ratio: planned > 0 ? Math.min(1, done / planned) : 0 };
    }
    if (shownView !== "month") return null;
    const inMonth = data.occurrences.filter((o) => new Date(o.start).getMonth() === cursor.getMonth());
    const events = inMonth.filter((o) => o.event.kind === "event").length;
    const study = inMonth.filter((o) => o.event.kind === "study");
    const reminders = inMonth.filter((o) => o.event.kind === "reminder").length;
    const plannedSeconds = study.reduce((sum, o) => sum + (o.end - o.start) / 1000, 0);
    return {
      text: `${events} ${events === 1 ? "evento" : "eventi"} · ${study.length} ${study.length === 1 ? "sessione" : "sessioni"} · ${durationText(
        plannedSeconds
      )} di studio${reminders > 0 ? ` · ${reminders} promemoria` : ""}`,
      ratio: null,
    };
  }, [shownView, data.occurrences, data.study, cursor]);

  const week = useMemo(() => weekDays(cursor), [cursor]);
  const oneDay = useMemo(() => [startOfDay(cursor)], [cursor]);

  function openTimer(subjectId: number | null) {
    requestWidgetIntent("study", { type: "openTimer", subjectId });
    openWidgetDetail("study");
  }

  function changeTimes(occ: Occurrence, startAt: number, endAt: number) {
    withScope(occ, "change", (s) => changeOccurrence(occ, { startAt, endAt }, s));
  }

  const quickInitial = quick
    ? {
        kind: quick.kind ?? ("event" as const),
        title: "",
        subjectId: quick.subjectId ?? null,
        allDay: quick.allDay,
        startMin: quick.startMin,
        endMin: quick.endMin,
      }
    : null;

  return (
    <div className="cal-detail">
      <header className="cal-head">
        <div className="cal-head-left">
          <BackButton onClick={goToDashboard} />
          <h1 className="cal-title">
            <button
              ref={titleRef}
              type="button"
              className="cal-title-btn"
              aria-haspopup="dialog"
              aria-expanded={picking}
              title="Scegli mese e anno"
              onClick={() => setPicking(true)}
            >
              {title.main} <span>{title.year}</span>
              <MdExpandMore className="cal-title-caret" aria-hidden="true" />
            </button>
          </h1>
          <div className="cal-head-nav">
            <button type="button" className="cal-btn-icon" aria-label={STEP_LABEL[shownView][0]} onClick={() => setCursor((c) => step(shownView, c, -1))}>
              <MdChevronLeft aria-hidden="true" />
            </button>
            <button type="button" className="cal-btn-ghost cal-today-btn" onClick={() => setCursor(startOfDay(new Date()))}>
              Oggi
            </button>
            <button type="button" className="cal-btn-icon" aria-label={STEP_LABEL[shownView][1]} onClick={() => setCursor((c) => step(shownView, c, 1))}>
              <MdChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="cal-head-right">
          {!compact && (
          <nav className="cal-seg" aria-label="Vista">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-current={shownView === v.id ? "page" : undefined}
                className={shownView === v.id ? "active" : ""}
                onClick={() => chooseView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </nav>
          )}
          <button
            ref={newButtonRef}
            type="button"
            className="cal-btn-primary cal-new-btn"
            onClick={() => newButtonRef.current && openNew(newItemDay(), newButtonRef.current)}
          >
            <MdAdd aria-hidden="true" />
            Nuovo
          </button>
        </div>
      </header>

      <div className="cal-toolbar">
        <div className="cal-filters">
          {(
            [
              ["event", "Eventi"],
              ["study", "Studio"],
              ["reminder", "Promemoria"],
              ["note", "Note"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filters[k]}
              className={`cal-filter cal-filter--${k}`}
              onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}
            >
              <KindMark kind={k} />
              {label}
            </button>
          ))}
        </div>
        <div className="cal-legend">
          <span>
            <KindMark kind="study" filled />
            fatta
          </span>
          <span>
            <KindMark kind="study" />
            in programma
          </span>
          {summary && <span>{summary.text}</span>}
          {summary && summary.ratio !== null && (
            <span className="cal-progress" role="img" aria-label={`Avanzamento dello studio della settimana: ${Math.round(summary.ratio * 100)}%`}>
              <span style={{ width: `${summary.ratio * 100}%` }} />
            </span>
          )}
        </div>
      </div>

      {view === null || !data.ready ? (
        <p className="cal-loading">Caricamento…</p>
      ) : shownView === "month" ? (
        <MonthView
          year={cursor.getFullYear()}
          month={cursor.getMonth()}
          data={data}
          filters={filters}
          onCreate={(day, el) => openNew(day, el)}
          onOpen={openEdit}
          onOpenNote={openNote}
          onMore={(day) => {
            setCursor(startOfDay(day));
            chooseView("day");
          }}
          onMove={moveToDay}
        />
      ) : shownView === "week" ? (
        <TimeGrid
          days={week}
          hourPx={WEEK_HOUR_PX}
          variant="week"
          data={data}
          filters={filters}
          creating={quick !== null}
          onCreate={(day, s, e, el) => openNew(day, el, s, e)}
          onCreateAllDay={(day, el) => openNew(day, el, 0, 1440, true)}
          onOpen={openEdit}
          onOpenNote={openNote}
          onMore={(day) => {
            setCursor(startOfDay(day));
            chooseView("day");
          }}
          onChange={changeTimes}
        />
      ) : (
        <div className="cal-dayview">
          <TimeGrid
            days={oneDay}
            hourPx={DAY_HOUR_PX}
            variant="day"
            data={data}
            filters={filters}
            creating={quick !== null}
            onCreate={(day, s, e, el) => openNew(day, el, s, e)}
            onCreateAllDay={(day, el) => openNew(day, el, 0, 1440, true)}
            onOpen={openEdit}
            onOpenNote={openNote}
            onMore={() => undefined}
            onChange={changeTimes}
            allDayExtra={
              <LinkNoteButton
                label="+ Aggiungi"
                ariaLabel="Collega una nota a questo giorno"
                className="cal-tg-addnote"
                exclude={data.notes.filter((n) => n.day === dayKey(cursor)).map((n) => n.noteId)}
                onPick={(note) =>
                  void linkNote(note.id, { day: dayKey(cursor), eventId: null }).catch((error) =>
                    console.error("Calendario: nota non collegata", error)
                  )
                }
              />
            }
          />
          <DaySidebar day={cursor} data={data} onOpen={openEdit} onOpenNote={openNote} onOpenTimer={openTimer} />
        </div>
      )}

      {quick && quickInitial && (
        <QuickEventPopover
          key={`new${quick.day.getTime()}:${quick.startMin}:${quick.parentId ?? ""}`}
          anchor={anchorRef}
          day={quick.day}
          initial={quickInitial}
          subjects={data.subjectList}
          now={data.now}
          onSave={save}
          onCustomize={customize}
          onClose={() => setQuick(null)}
        />
      )}

      {panel && (
        <EventPanel
          target={panel}
          now={data.now}
          subjects={data.subjectList}
          subjectMap={data.subjects}
          categories={data.categoryList}
          onClose={closePanel}
          onOpenTarget={setPanel}
          onDelete={removeFromPanel}
          onPlanSession={planSession}
          onOpenNote={(id) => {
            closePanel();
            openNote(id);
          }}
          onOpenTimer={(id) => {
            closePanel();
            openTimer(id);
          }}
        />
      )}

      {picking && (
        <MonthPicker
          anchor={titleRef}
          year={cursor.getFullYear()}
          month={cursor.getMonth()}
          now={data.now}
          onPick={(y, m) => {
            setPicking(false);
            const now = data.now;
            setCursor(y === now.getFullYear() && m === now.getMonth() ? startOfDay(now) : new Date(y, m, 1));
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {scope && (
        <SeriesScopeDialog
          action={scope.action}
          onChoose={(s) => {
            const run = scope.run;
            setScope(null);
            void run(s);
          }}
          onCancel={() => setScope(null)}
        />
      )}
    </div>
  );
}

export default CalendarDetail;
