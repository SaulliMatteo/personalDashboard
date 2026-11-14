import { useRef, useState, type KeyboardEvent } from "react";
import "./StudyDetail.css";
import { useNav } from "../../core/nav/useNav";
import { useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import BackButton from "../../ui/BackButton";
import { useTimer } from "./timer/useTimer";
import TimerTab from "./detail/TimerTab";
import ReportTab from "./detail/ReportTab";
import PerspectiveTab from "./detail/PerspectiveTab";
import RunesTab from "./detail/RunesTab";

type DetailTab = "timer" | "report" | "perspective" | "runes";

const ALL_TABS: { id: DetailTab; label: string }[] = [
  { id: "timer", label: "Timer" },
  { id: "report", label: "Report" },
  { id: "perspective", label: "Prospettiva" },
  { id: "runes", label: "Rune" },
];

/** La scheda Rune (la progressione) c'è solo in Ombra (Temi Vetro e Ombra.html). */
const SHOW_RUNES: ThemeVariants<boolean> = { notte: false, opaco: false, quaderno: false, fosforo: false, vetro: false, ombra: true };

function isDetailTab(value: string | undefined): value is DetailTab {
  return ALL_TABS.some((t) => t.id === value);
}

/** Pagina a schermo intero del widget Studio: una scheda per vista, scelta dal selettore nell'intestazione. */
function StudyDetail() {
  const { ready } = useTimer();
  const { view, goToDashboard } = useNav();
  const showRunes = useThemeVariant(SHOW_RUNES);
  const TABS = showRunes ? ALL_TABS : ALL_TABS.filter((t) => t.id !== "runes");
  // la barra laterale di Ombra apre direttamente le Rune (view.tab)
  const requested = view.type === "widgetDetail" ? view.tab : undefined;
  const [chosen, setTab] = useState<DetailTab>(isDetailTab(requested) ? requested : "timer");
  // pagina già aperta e una nuova richiesta (la card delle rune toccata dallo Studio): si segue la richiesta
  const [lastView, setLastView] = useState(view);
  if (view !== lastView) {
    setLastView(view);
    if (isDetailTab(requested)) setTab(requested);
  }
  // cambiando tema la scheda Rune sparisce: si torna al Timer
  const tab = TABS.some((t) => t.id === chosen) ? chosen : "timer";
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Frecce sinistra/destra: spostano la scheda scelta (e il focus), in giro.
  function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const current = TABS.findIndex((t) => t.id === tab);
    const next = (current + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    // "--fit": nella scheda Timer la pagina occupa esattamente la finestra e
    // scrolla solo l'elenco materie; le altre schede, più lunghe, scrollano con la pagina.
    <div className={`study-detail${tab === "timer" ? " study-detail--fit" : ""}`}>
      <header className="dashboard-header study-detail-header">
        <div>
          <h1>Studio</h1>
          {ready && <p>Timer pomodoro, cronometro e tempo di studio per materia.</p>}
        </div>
        <div className="study-detail-header-actions">
          {ready && (
            <div className="study-tabs" role="tablist" aria-label="Viste dello Studio" onKeyDown={onTabKeyDown}>
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  tabIndex={tab === t.id ? 0 : -1}
                  className={tab === t.id ? "active" : ""}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <BackButton onClick={goToDashboard} />
        </div>
      </header>

      {!ready ? (
        <p className="study-detail-loading">Caricamento…</p>
      ) : tab === "timer" ? (
        <TimerTab />
      ) : tab === "report" ? (
        <ReportTab />
      ) : tab === "runes" ? (
        <RunesTab />
      ) : (
        <PerspectiveTab />
      )}
    </div>
  );
}

export default StudyDetail;
