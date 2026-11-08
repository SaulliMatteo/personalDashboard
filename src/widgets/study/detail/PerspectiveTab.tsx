import { createElement, useEffect, useState, type ComponentType } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { useNav } from "../../../core/nav/useNav";
import { useSettings } from "../../../core/settings/useSettings";
import { useThemeVariant, type ThemeVariants } from "../../../core/theme/variants";
import { DialFit, DotDial, PenDial, RingDial, TickDial, type DialProps } from "../components/dial/Dials";
import { getFirstSessionTime, getSessionsBetween } from "../data/studyRepository";
import { formatHoursMinutes } from "../lib/format";
import {
  awakeHours,
  clampSleepHours,
  formatShare,
  perspectiveRange,
  perspectiveShares,
  type PerspectivePeriod,
} from "../lib/perspective";
import { useTimer } from "../timer/useTimer";
import "./reportTab.css";
import "./perspectiveTab.css";

const PERIODS: { id: PerspectivePeriod; label: string }[] = [
  { id: "day", label: "Oggi" },
  { id: "week", label: "Settimana" },
  { id: "month", label: "Mese" },
];

/** Fosforo: il quadrante a puntini del timer, ma senza LED (qui non corre niente). */
function StillDotDial(props: DialProps) {
  return <DotDial {...props} running={false} />;
}

/** Il quadrante del timer di ogni tema; Opaco, che nel timer non ne ha uno, usa l'anello. */
const DIALS: ThemeVariants<ComponentType<DialProps>> = {
  notte: TickDial,
  opaco: RingDial,
  quaderno: PenDial,
  fosforo: StillDotDial,
};

/** "1 ora" / "8 ore". */
function hoursText(hours: number): string {
  return `${hours} ${hours === 1 ? "ora" : "ore"}`;
}

/**
 * Scheda Prospettiva: il tempo studiato nel periodo rispetto alle 24 ore e al tempo da sveglio.
 * Contano solo le sessioni registrate, attribuite al giorno in cui finiscono (come nel Report).
 */
function PerspectiveTab() {
  const { todayBySubject } = useTimer();
  const { settings } = useSettings();
  const { openSettings } = useNav();
  const Dial = useThemeVariant(DIALS);
  const [period, setPeriod] = useState<PerspectivePeriod>("day");
  const [offset, setOffset] = useState(0); // 0 = periodo in corso, -1 = il precedente…
  const [studiedSeconds, setStudiedSeconds] = useState(0);
  const [firstSession, setFirstSession] = useState<number | null>(null);

  const range = perspectiveRange(period, offset, new Date());

  // La scheda è montata solo quando è aperta: i dati si caricano solo allora (e si
  // ricaricano se cambia il periodo o si registra una sessione).
  useEffect(() => {
    let cancelled = false;
    async function refetch() {
      try {
        const [sessions, first] = await Promise.all([getSessionsBetween(range.start, range.end), getFirstSessionTime()]);
        if (cancelled) return;
        setStudiedSeconds(sessions.reduce((sum, s) => sum + s.durationSeconds, 0));
        setFirstSession(first);
      } catch (error) {
        console.error("Errore nel caricamento della prospettiva:", error);
      }
    }
    void refetch();
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, todayBySubject]);

  function changePeriod(next: PerspectivePeriod) {
    setPeriod(next);
    setOffset(0);
  }

  // Si può tornare indietro solo se esistono sessioni prima dell'inizio del periodo mostrato.
  const canGoBack = firstSession !== null && firstSession < range.start;
  const canGoForward = offset < 0;

  const days = range.elapsedDays;
  const sleep = clampSleepHours(settings.studySleepHours);
  const awake = awakeHours(sleep);
  const { ofDay, ofAwake } = perspectiveShares(studiedSeconds, days, sleep);
  const studied = formatHoursMinutes(studiedSeconds);
  const multi = days > 1 ? ` (${days} giorni × ` : null;

  const panels = [
    {
      key: "day",
      share: ofDay,
      caption: "della giornata",
      title: "Rispetto alle 24 ore",
      detail: `${studied} su ${days * 24}h${multi ? `${multi}24h)` : ""}`,
      total: days * 24,
    },
    {
      key: "awake",
      share: ofAwake,
      caption: "del tempo da sveglio",
      title: "Rispetto al tempo da sveglio",
      detail: `${studied} su ${days * awake}h da sveglio${multi ? `${multi}${awake}h)` : ""}`,
      total: days * awake,
    },
  ];

  return (
    <section className="study-report study-persp">
      <div className="study-report-header">
        <div className="study-report-nav">
          <button
            type="button"
            className="study-nav-btn"
            onClick={() => setOffset((o) => o - 1)}
            disabled={!canGoBack}
            aria-label="Periodo precedente"
            title={canGoBack ? "Periodo precedente" : "Non ci sono sessioni prima di questo periodo"}
          >
            <MdChevronLeft />
          </button>
          <h2 className="study-report-title">{range.title}</h2>
          <button
            type="button"
            className="study-nav-btn"
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={!canGoForward}
            aria-label="Periodo successivo"
          >
            <MdChevronRight />
          </button>
          {offset !== 0 && (
            <button type="button" className="study-nav-today" onClick={() => setOffset(0)}>
              Oggi
            </button>
          )}
        </div>

        <div className="study-period-toggle">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className={period === p.id ? "active" : ""} onClick={() => changePeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="study-persp-intro">
        {studiedSeconds > 0 ? (
          <>
            Hai studiato <strong>{studied}</strong>. Ecco quanto pesa davvero.
          </>
        ) : (
          "Nessuno studio registrato in questo periodo."
        )}
      </p>

      <div className="study-persp-grid">
        {panels.map((panel) => (
          <div key={panel.key} className="study-persp-panel">
            <div
              className="study-persp-dial"
              role="img"
              aria-label={`${formatShare(panel.share)} ${panel.caption}: ${studied} su ${panel.total} ore`}
            >
              <DialFit max={240}>
                {(side) =>
                  createElement(
                    Dial,
                    { size: side, progress: panel.share },
                    <span className="study-persp-value">{formatShare(panel.share)}</span>,
                    <span className="study-persp-caption">{panel.caption}</span>
                  )
                }
              </DialFit>
            </div>
            <h3 className="study-persp-title">{panel.title}</h3>
            <p className="study-persp-detail">{panel.detail}</p>
          </div>
        ))}
      </div>

      <div className="study-persp-foot">
        <span>
          Sonno considerato: {hoursText(sleep)} al giorno, quindi {hoursText(awake)} da sveglio.
        </span>
        <button type="button" className="study-persp-settings" onClick={() => openSettings("widget:study")}>
          Cambia in Impostazioni
        </button>
      </div>
    </section>
  );
}

export default PerspectiveTab;
