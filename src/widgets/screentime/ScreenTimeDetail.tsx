import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useNav } from "../../core/nav/useNav";
import { useSettings } from "../../core/settings/useSettings";
import { APP_CATEGORIES } from "../../core/system/appCategory";
import BackButton from "../../ui/BackButton";
import { useScreenTime } from "./useScreenTime";
import { dayBounds, dayKey, shiftDay, weekStart } from "./lib/aggregate";
import { CATEGORY_HINT, CATEGORY_LABEL } from "./lib/categories";
import { CLASS_LABEL, FOCUS_CLASSES, focusStreak } from "./lib/focus";
import { formatClock, formatDayLabel, formatDelta, formatDuration, formatShort, formatWeekLabel, weekdayName, weekdayShort } from "./lib/format";
import type { ScreenLimit } from "./lib/limits";
import { breakStats, longestGap } from "./lib/sessions";
import { limitUsage, summarize, type RankItem } from "./lib/summary";
import { BigTime, ClassLegend, ClassSplit, DayChart, LimitBar } from "./components/parts";
import RankList from "./detail/RankList";
import LimitDialog, { type LimitDraft } from "./detail/LimitDialog";
import { usePeriodData, type DayTotal, type PeriodMode } from "./detail/usePeriodData";
import "./ScreenTimeWidget.css";
import "./ScreenTimeDetail.css";

const KIND_NAME = { app: "app", site: "sito", category: "categoria" } as const;
const pct = (v: number, of: number) => (of > 0 ? Math.round((v / of) * 100) : 0);

/**
 * Pagina di Tempo al PC (docs/design/temi/tempo-pc.html): giorno (riepilogo, linea del giorno, classifiche di app e
 * siti con il menu ⋯, limiti, pause) e settimana (barre per giorno con l'obiettivo di focus, più usati, Focus o svago).
 */
function ScreenTimeDetail() {
  const { goToDashboard } = useNav();
  const st = useScreenTime();
  const { settings, updateSetting } = useSettings();

  if (!st.available) {
    return (
      <div className="stp">
        <header className="dashboard-header">
          <div>
            <h1>Tempo al PC</h1>
          </div>
          <BackButton onClick={goToDashboard} />
        </header>
        <section className="stp-card">
          <p className="stp-fine">Tempo al PC legge l'app in primo piano di questo computer: c'è solo nell'app desktop per Windows e macOS.</p>
        </section>
      </div>
    );
  }
  if (!st.enabled) {
    return (
      <div className="stp">
        <header className="dashboard-header">
          <div>
            <h1>Tempo al PC</h1>
            <p>Questo computer</p>
          </div>
          <BackButton onClick={goToDashboard} />
        </header>
        <section className="stp-card">
          <p className="stp-line">Il conteggio è spento: niente viene registrato. I giorni già contati restano qui sotto quando lo riaccendi.</p>
          <div>
            <button type="button" className="stp-btn stp-btn--primary" onClick={() => updateSetting("screentimeEnabled", true)}>
              Accendi il conteggio
            </button>
          </div>
        </section>
      </div>
    );
  }
  return <LiveDetail onBack={goToDashboard} closeToTray={settings.closeToTray} />;
}

function LiveDetail({ onBack, closeToTray }: { onBack: () => void; closeToTray: boolean }) {
  const st = useScreenTime();
  const { settings } = useSettings();
  const today = dayKey(st.now);
  const [mode, setMode] = useState<PeriodMode>("day");
  const [day, setDay] = useState(today);
  const data = usePeriodData(mode, day, today);
  const summary = useMemo(() => summarize(data.rows, st.classify), [data.rows, st.classify]);
  const [dialog, setDialog] = useState<{ initial: LimitDraft | null; editing: ScreenLimit | null } | null>(null);
  const sitesRef = useRef<HTMLElement | null>(null);

  // Prima di guardare: quello che il registratore ha in mano finisce nel DB.
  const { flush } = st;
  useEffect(() => {
    void flush();
  }, [flush]);

  const step = mode === "week" ? 7 : 1;
  const canPrev = data.firstDay !== null && (mode === "week" ? weekStart(day) > data.firstDay : day > data.firstDay);
  const canNext = mode === "week" ? weekStart(day) < weekStart(today) : day < today;
  const move = (dir: -1 | 1) => {
    if (dir < 0 ? !canPrev : !canNext) return;
    const next = shiftDay(day, dir * step);
    setDay(next > today ? today : next);
  };
  const periodLabel = mode === "week" ? formatWeekLabel(weekStart(day), shiftDay(weekStart(day), 6)) : formatDayLabel(day, today, shiftDay(today, -1));

  const limitFor = (kind: ScreenLimit["kind"], target: string) => st.limits.find((l) => l.limit.kind === kind && l.limit.target === target)?.limit ?? null;

  function openLimit(item: RankItem) {
    const kind = item.isSite ? "site" : "app";
    const target = item.isSite ? item.label : item.key;
    const existing = limitFor(kind, target);
    setDialog({ initial: existing ?? { kind, target, label: item.label, minutes: 60, warn: true }, editing: existing });
  }

  async function saveLimit(draft: LimitDraft) {
    const editing = dialog?.editing;
    if (editing && (editing.kind !== draft.kind || editing.target !== draft.target)) await st.deleteLimit(editing.id);
    await st.saveLimit(draft);
    setDialog(null);
  }

  const rankProps = {
    manualCategory: (item: RankItem) => st.classify.manual.get(item.key),
    onCategory: (item: RankItem, category: (typeof APP_CATEGORIES)[number] | null) => st.setCategory(item.key, category),
    onLimit: openLimit,
  };

  return (
    <div className="stp">
      <header className="dashboard-header">
        <div>
          <h1>Tempo al PC</h1>
          <p>
            {closeToTray
              ? "Questo computer · conta anche con la finestra chiusa, finché la dashboard è vicino all'orologio"
              : "Questo computer · conta finché la dashboard è aperta"}
          </p>
        </div>
        <div className="stp-actions">
          <div className="stp-tabs" role="group" aria-label="Periodo">
            <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")}>
              Giorno
            </button>
            <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")}>
              Settimana
            </button>
          </div>
          <div className="stp-daynav">
            <button className="stp-icon" type="button" aria-label={mode === "week" ? "Settimana prima" : "Giorno prima"} aria-disabled={!canPrev} onClick={() => move(-1)}>
              ‹
            </button>
            <span aria-live="polite">{periodLabel}</span>
            <button className="stp-icon" type="button" aria-label={mode === "week" ? "Settimana dopo" : "Giorno dopo"} aria-disabled={!canNext} onClick={() => move(1)}>
              ›
            </button>
          </div>
          <BackButton onClick={onBack} />
        </div>
      </header>

      {mode === "day" ? (
        <DayView
          day={day}
          today={today}
          data={data}
          summary={summary}
          rankProps={rankProps}
          sitesRef={sitesRef}
          onAddLimit={() => setDialog({ initial: null, editing: null })}
          onEditLimit={(limit) => setDialog({ initial: limit, editing: limit })}
          goalSeconds={settings.screentimeFocusGoalMinutes * 60}
          breakMinutes={settings.screentimeBreakMinutes}
        />
      ) : (
        <WeekView today={today} data={data} summary={summary} rankProps={rankProps} goalSeconds={settings.screentimeFocusGoalMinutes * 60} />
      )}

      {dialog && (
        <LimitDialog
          initial={dialog.initial}
          editing={dialog.editing}
          apps={data.recentApps}
          sites={data.recentSites}
          onSave={(d) => void saveLimit(d)}
          onDelete={(id) => {
            void st.deleteLimit(id);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

type RankProps = Pick<Parameters<typeof RankList>[0], "manualCategory" | "onCategory" | "onLimit">;
type Data = ReturnType<typeof usePeriodData>;
type Summary = ReturnType<typeof summarize>;

/** Media dei giorni con del tempo al PC tra i 7 prima di quello scelto (history[1..7]). */
function average7(history: DayTotal[]): number | null {
  const days = history.slice(1, 8).filter((d) => d.total > 0);
  return days.length > 0 ? days.reduce((s, d) => s + d.total, 0) / days.length : null;
}

interface DayViewProps {
  day: string;
  today: string;
  data: Data;
  summary: Summary;
  rankProps: RankProps;
  sitesRef: RefObject<HTMLElement | null>;
  onAddLimit: () => void;
  onEditLimit: (limit: ScreenLimit) => void;
  goalSeconds: number;
  breakMinutes: number;
}

function DayView({ day, today, data, summary, rankProps, sitesRef, onAddLimit, onEditLimit, goalSeconds, breakMinutes }: DayViewProps) {
  const st = useScreenTime();
  const isToday = day === today;
  const nowHour = isToday ? new Date(st.now).getHours() : null;

  // Confronto: oggi con ieri fino alla stessa ora, gli altri giorni con il giorno prima intero.
  const previous = isToday ? st.yesterdaySoFar : (data.history[1]?.total ?? 0);
  const avg = average7(data.history);
  const streak = focusStreak(data.history.map((d) => ({ total: d.total, focus: d.byClass.focus })), goalSeconds);
  const funNames = summary.top.filter((i) => i.cls === "fun").slice(0, 2).map((i) => i.label).join(", ");

  const [from, to] = dayBounds(day);
  const gap = longestGap(data.sessions, from, to);
  const breaks = breakStats(data.sessions);
  const browsers = new Set(summary.sites.map((s) => s.appKey));
  const sitesTotal = summary.sites.reduce((s, i) => s + i.seconds, 0);

  const limits = isToday ? st.limits : st.limits.map(({ limit }) => ({ limit, usedSeconds: limitUsage(data.rows, limit, st.classify.manual) }));

  if (!data.loading && summary.total === 0) {
    return (
      <section className="stp-card stp-empty">
        <p className="stp-line">{isToday ? "Ancora niente oggi: il conteggio parte da quando apri la dashboard." : "Nessun tempo al PC contato in questo giorno."}</p>
      </section>
    );
  }

  return (
    <>
      <div className="stp-grid stp-grid--sum">
        <section className="stp-card">
          <div className="stp-card-head">
            <h2>Totale</h2>
            <span>{isToday ? "oggi" : weekdayName(day)}</span>
          </div>
          <BigTime seconds={summary.total} className="stp-big" />
          <p className="stp-line">
            <b>{formatDelta(summary.total - previous, isToday ? "ieri a quest'ora" : weekdayName(shiftDay(day, -1)))}</b>
            {avg !== null && (
              <>
                {" "}
                · media dei 7 giorni <b>{formatDuration(avg)}</b>
              </>
            )}
          </p>
        </section>
        <section className="stp-card">
          <div className="stp-card-head">
            <h2>Focus</h2>
            <span>{goalSeconds > 0 ? `obiettivo ${formatDuration(goalSeconds)}` : ""}</span>
          </div>
          <span className="stw-num stp-big">
            {pct(summary.byClass.focus, summary.total)}
            <span className="stw-unit">%</span>
          </span>
          {goalSeconds > 0 && <LimitBar used={summary.byClass.focus} max={goalSeconds} quiet />}
          <p className="stp-line">
            <b>{formatDuration(summary.byClass.focus)}</b>
            {goalSeconds > 0 && ` di ${formatDuration(goalSeconds)}`}
            {streak > 0 && (
              <>
                {" "}
                · serie di <b>{streak === 1 ? "1 giorno" : `${streak} giorni`}</b>
              </>
            )}
          </p>
        </section>
        <section className="stp-card">
          <div className="stp-card-head">
            <h2>Svago</h2>
            <span>{funNames}</span>
          </div>
          <BigTime seconds={summary.byClass.fun} className="stp-big" />
          <ClassSplit byClass={summary.byClass} />
        </section>
        <section className="stp-card">
          <div className="stp-card-head">
            <h2>Primo e ultimo uso</h2>
          </div>
          <span className="stw-num stp-big">
            {summary.firstAt !== null ? formatClock(summary.firstAt) : "—"}
            <span className="stw-unit">–</span>
            {summary.lastAt !== null ? formatClock(summary.lastAt) : "—"}
          </span>
          {gap && (
            <p className="stp-line">
              pausa più lunga <b>{formatDuration((gap.endAt - gap.startAt) / 1000)}</b> ({formatClock(gap.startAt)} – {formatClock(gap.endAt)})
            </p>
          )}
        </section>
      </div>

      <section className="stp-card">
        <div className="stp-card-head">
          <h2>La giornata</h2>
          <ClassLegend byClass={summary.byClass} withTime />
        </div>
        <DayChart hours={summary.hours} nowHour={nowHour} height={130} />
      </section>

      <div className="stp-grid stp-grid--two">
        <section className="stp-card">
          <div className="stp-card-head">
            <h2>App</h2>
            <span>
              {summary.apps.length === 1 ? "1 app" : `${summary.apps.length} app`} · {formatDuration(summary.total)}
            </span>
          </div>
          <RankList
            items={summary.apps}
            {...rankProps}
            hasSites={(item) => browsers.has(item.key)}
            onShowSites={() => sitesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            empty="Nessuna app."
          />
        </section>
        <section className="stp-card" ref={sitesRef}>
          <div className="stp-card-head">
            <h2>Siti</h2>
            <span>nel browser · {formatDuration(sitesTotal)}</span>
          </div>
          <RankList items={summary.sites} {...rankProps} empty="Nessun sito in questo giorno." />
          <p className="stp-fine">Il sito si ricava dal titolo della scheda: se un sito non mette il suo nome nel titolo finisce in "Altro sul web".</p>
        </section>
      </div>

      <div className="stp-grid stp-grid--two">
        <section className="stp-card">
          <div className="stp-card-head">
            <h2>{isToday ? "Limiti di oggi" : "Limiti in quel giorno"}</h2>
            <button type="button" className="stp-btn stp-btn--small" onClick={onAddLimit}>
              + Aggiungi limite
            </button>
          </div>
          {limits.length === 0 ? (
            <p className="stp-fine">Nessun limite. Mettine uno a un'app, a un sito o a una categoria, anche dal menu ⋯ di una riga.</p>
          ) : (
            <ul className="stp-limits">
              {limits.map(({ limit, usedSeconds }) => {
                const max = limit.minutes * 60;
                const near = usedSeconds / max >= 0.8;
                return (
                  <li key={limit.id}>
                    <button type="button" className="stp-limit-top" onClick={() => onEditLimit(limit)} aria-label={`Modifica il limite di ${limit.label}`}>
                      <span>
                        {limit.label} <small>{KIND_NAME[limit.kind]}</small>
                      </span>
                      <span className={`stw-mono${near ? " is-near" : ""}`}>
                        {Math.floor(usedSeconds / 60)} / {limit.minutes} min
                        {usedSeconds >= max ? " · superato" : near ? " · quasi" : ""}
                      </span>
                    </button>
                    <LimitBar used={usedSeconds} max={max} />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="stp-fine">Avviso {settingsWarnText(limits.map((l) => l.limit))}, una volta al giorno. Il limite non blocca nulla: ti avvisa e basta.</p>
        </section>
        <section className="stp-card">
          <div className="stp-card-head">
            <h2>Pause</h2>
            <span>{breakMinutes > 0 ? `promemoria dopo ${formatDuration(breakMinutes * 60)}` : "promemoria spento"}</span>
          </div>
          <p className="stp-line">
            {isToday && (
              <>
                {st.continuousMinutes > 0 ? (
                  <>
                    Al PC da <b>{formatDuration(st.continuousMinutes * 60)}</b> senza una pausa.{" "}
                  </>
                ) : (
                  "Adesso sei in pausa. "
                )}
              </>
            )}
            {isToday ? "Oggi " : "Quel giorno "}
            <b>{breaks.breaks === 1 ? "1 pausa" : `${breaks.breaks} pause`}</b> da almeno 5 minuti
            {breaks.longest && (
              <>
                , la sessione più lunga è stata di <b>{formatDuration((breaks.longest.endAt - breaks.longest.startAt) / 1000)}</b> ({formatClock(breaks.longest.startAt)} –{" "}
                {formatClock(breaks.longest.endAt)})
              </>
            )}
            .
          </p>
          {isToday && breakMinutes > 0 && <LimitBar used={st.continuousMinutes} max={breakMinutes} />}
          <p className="stp-fine">Una pausa è almeno 5 minuti senza toccare mouse e tastiera (o con lo schermo bloccato).</p>
        </section>
      </div>
    </>
  );
}

function settingsWarnText(limits: ScreenLimit[]): string {
  if (limits.length > 0 && limits.every((l) => !l.warn)) return "allo scadere";
  return "all'80 % e allo scadere";
}

interface WeekViewProps {
  today: string;
  data: Data;
  summary: Summary;
  rankProps: RankProps;
  goalSeconds: number;
}

function WeekView({ today, data, summary, rankProps, goalSeconds }: WeekViewProps) {
  const st = useScreenTime();
  const max = Math.max(3600, goalSeconds * 1.25, ...data.week.map((d) => d.total));
  const reached = data.week.filter((d) => goalSeconds > 0 && d.byClass.focus >= goalSeconds);
  const best = data.week.reduce<DayTotal | null>((a, d) => (d.byClass.focus > 0 && (!a || d.byClass.focus > a.byClass.focus) ? d : a), null);
  const streak = focusStreak(data.history.map((d) => ({ total: d.total, focus: d.byClass.focus })), goalSeconds);

  return (
    <>
      <div className="stp-grid stp-grid--two">
        <section className="stp-card">
          <div className="stp-card-head">
            <h2>Settimana</h2>
            <span>
              {formatDuration(summary.total)} · focus {pct(summary.byClass.focus, summary.total)} %
            </span>
          </div>
          <div className="stp-week">
            <div className="stp-week-plot">
              {data.week.map((d) => (
                <div
                  key={d.day}
                  className={`stp-weekbar${d.day === today ? " is-today" : ""}${d.total > 0 ? "" : " is-empty"}`}
                  title={`${weekdayName(d.day)}: ${d.total > 0 ? formatDuration(d.total) : "niente"}`}
                >
                  {FOCUS_CLASSES.map((c) =>
                    d.byClass[c] > 0 ? <span key={c} className={`st-seg is-${c}`} style={{ "--v": `${(d.byClass[c] / max) * 100}%` } as CSSProperties} /> : null
                  )}
                </div>
              ))}
              {goalSeconds > 0 && (
                <div className="stp-goal" style={{ "--gr": goalSeconds / max } as CSSProperties}>
                  <span>obiettivo focus {formatDuration(goalSeconds)}</span>
                </div>
              )}
            </div>
            <div className="stp-week-days">
              {data.week.map((d) => (
                <small key={d.day} className={d.day === today ? "is-today" : undefined}>
                  <b>{d.total > 0 ? formatShort(d.total) : "—"}</b>
                  {weekdayShort(d.day)}
                </small>
              ))}
            </div>
          </div>
          <p className="stp-line">
            {goalSeconds > 0 ? (
              <>
                Il tratteggio è l'obiettivo di focus (<b>{formatDuration(goalSeconds)}</b> al giorno):{" "}
                {reached.length === 0 ? "non ancora raggiunto in questa settimana" : `raggiunto ${joinDays(reached.map((d) => weekdayName(d.day)))}`}.
                {streak > 0 && (
                  <>
                    {" "}
                    Serie in corso: <b>{streak === 1 ? "1 giorno" : `${streak} giorni`}</b>.
                  </>
                )}
              </>
            ) : (
              "Nessun obiettivo di focus (si imposta in Impostazioni > Widget > Tempo al PC)."
            )}
            {best && (
              <>
                {" "}
                Giorno con più focus: <b>{weekdayName(best.day)}</b> ({formatDuration(best.byClass.focus)}).
              </>
            )}
          </p>
          <ClassLegend byClass={summary.byClass} withTime />
        </section>
        <section className="stp-card">
          <div className="stp-card-head">
            <h2>Più usati in settimana</h2>
            <span>app e siti</span>
          </div>
          <RankList items={summary.top} {...rankProps} empty="Nessun tempo al PC in questa settimana." />
        </section>
      </div>

      <section className="stp-card">
        <div className="stp-card-head">
          <h2>Focus o svago</h2>
          <span>vale per tutti i giorni, anche quelli passati</span>
        </div>
        <ul className="stp-classes">
          {APP_CATEGORIES.map((c) => (
            <li key={c}>
              <span>
                {CATEGORY_LABEL[c]}
                <small>{CATEGORY_HINT[c]}</small>
              </span>
              <span className="stp-seg3" role="group" aria-label={`Classe di ${CATEGORY_LABEL[c]}`}>
                {(["focus", "neutral", "fun"] as const).map((cls) => (
                  <button key={cls} type="button" aria-pressed={st.classify.classes[c] === cls} onClick={() => st.setFocusClass(c, cls)}>
                    <i className={`st-seg is-${cls}`} aria-hidden="true" />
                    {CLASS_LABEL[cls]}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="stp-fine">La categoria di un'app o di un sito si cambia dal menu ⋯ della sua riga (la scelta vale anche per Pixy).</p>
      </section>
    </>
  );
}

/** "lunedì", "lunedì e mercoledì", "lunedì, mercoledì e giovedì". */
function joinDays(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export default ScreenTimeDetail;
