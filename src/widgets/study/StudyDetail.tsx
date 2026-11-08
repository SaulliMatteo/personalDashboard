import { useRef, useState, type KeyboardEvent } from "react";
import "./StudyDetail.css";
import { useNav } from "../../core/nav/useNav";
import BackButton from "../../ui/BackButton";
import { useTimer } from "./timer/useTimer";
import TimerTab from "./detail/TimerTab";
import ReportTab from "./detail/ReportTab";
import PerspectiveTab from "./detail/PerspectiveTab";

type DetailTab = "timer" | "report" | "perspective";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "timer", label: "Timer" },
  { id: "report", label: "Report" },
  { id: "perspective", label: "Prospettiva" },
];

/** Pagina a schermo intero del widget Studio: una scheda per vista, scelta dal selettore nell'intestazione. */
function StudyDetail() {
  const { ready } = useTimer();
  const { goToDashboard } = useNav();
  const [tab, setTab] = useState<DetailTab>("timer");
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
      ) : (
        <PerspectiveTab />
      )}
    </div>
  );
}

export default StudyDetail;
