import { useState } from "react";
import { MdBarChart, MdOutlineTimer } from "react-icons/md";
import "./StudyDetail.css";
import { useNav } from "../../core/nav/useNav";
import BackButton from "../../ui/BackButton";
import { useTimer } from "./timer/useTimer";
import TimerTab from "./detail/TimerTab";
import ReportTab from "./detail/ReportTab";

type DetailTab = "timer" | "report";

/** Pagina a schermo intero del widget Studio: scheda Timer (con materie) e scheda Report. */
function StudyDetail() {
  const { ready } = useTimer();
  const { goToDashboard } = useNav();
  const [tab, setTab] = useState<DetailTab>("timer");

  return (
    // "--fit": nella scheda Timer la pagina occupa esattamente la finestra e
    // scrolla solo l'elenco materie; il Report, più lungo, scrolla con la pagina.
    <div className={`study-detail${tab === "timer" ? " study-detail--fit" : ""}`}>
      <header className="dashboard-header study-detail-header">
        <div>
          <h1>Studio</h1>
          {ready && <p>Timer pomodoro, cronometro e tempo di studio per materia.</p>}
        </div>
        <div className="study-detail-header-actions">
          {ready &&
            (tab === "timer" ? (
              <button type="button" className="study-report-btn" onClick={() => setTab("report")}>
                <MdBarChart /> Report
              </button>
            ) : (
              <button type="button" className="study-report-btn" onClick={() => setTab("timer")}>
                <MdOutlineTimer /> Timer
              </button>
            ))}
          <BackButton onClick={goToDashboard} />
        </div>
      </header>

      {!ready ? (
        <p className="study-detail-loading">Caricamento…</p>
      ) : tab === "timer" ? (
        <TimerTab />
      ) : (
        <ReportTab />
      )}
    </div>
  );
}

export default StudyDetail;
