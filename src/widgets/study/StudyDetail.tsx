import { useState } from "react";
import "./StudyDetail.css";
import { useNav } from "../../core/nav/NavContext";
import SettingsSection from "../../core/settings/components/SettingsSection";
import BackButton from "../../ui/BackButton";
import { useTimer } from "./TimerContext";
import TimerTab from "./detail/TimerTab";
import ReportTab from "./detail/ReportTab";

type DetailTab = "timer" | "settings" | "report";

function StudyDetail() {
  const { ready } = useTimer();
  const { goToDashboard } = useNav();
  const [tab, setTab] = useState<DetailTab>("timer");

  return (
    <div className="study-detail">
      <header className="dashboard-header study-detail-header">
        <div>
          <h1>Studio</h1>
          {ready && <p>Timer pomodoro e tempo di studio per materia.</p>}
        </div>
        <BackButton onClick={goToDashboard} />
      </header>

      {!ready ? (
        <p className="study-detail-loading">Caricamento…</p>
      ) : (
        <>
          <div className="study-tabs">
            <button type="button" className={tab === "timer" ? "active" : ""} onClick={() => setTab("timer")}>
              Timer
            </button>
            <button type="button" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
              Impostazioni
            </button>
            <button type="button" className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>
              Report
            </button>
          </div>

          {tab === "timer" && <TimerTab />}

          {tab === "settings" && (
            <section className="study-settings-card">
              <h2 className="study-section-title">Impostazioni timer</h2>
              <p className="study-settings-intro">
                Valgono dal prossimo ciclo in poi: una fase già in corso mantiene la durata con cui è partita.
              </p>
              {/* Campi generati dallo schema (core/settings/schema.ts, gruppo "study"). */}
              <SettingsSection group="study" className="study-settings-grid" />
            </section>
          )}

          {tab === "report" && <ReportTab />}
        </>
      )}
    </div>
  );
}

export default StudyDetail;
