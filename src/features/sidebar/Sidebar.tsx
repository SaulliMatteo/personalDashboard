import { MdOutlineSettings } from "react-icons/md";
import "./sidebar.css";
import { useActivityStatus } from "../../core/activity/activityBus";
import { useNav } from "../../core/nav/useNav";
import { useSettings } from "../../core/settings/useSettings";
import { useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import ProgressBar from "../../ui/ProgressBar";

/** Simbolo accanto al titolo dell'app, uno per tema (mockup). */
const LOGOS: ThemeVariants<React.JSX.Element | null> = {
  notte: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  ),
  opaco: null,
  quaderno: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 9h16M4 15h16M10 3v18" />
    </svg>
  ),
  fosforo: <span className="sidebar-logo-dot" aria-hidden="true" />,
};

/** La card "Obiettivo di oggi" c'è solo nel mockup di Notte. */
const SHOW_GOAL: ThemeVariants<boolean> = { notte: true, opaco: false, quaderno: false, fosforo: false };

/** "2h 05m". */
function hoursMinutes(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Obiettivo di studio di oggi: dati dall'activityBus, pubblicati dallo Studio. */
function GoalCard({ goalMinutes }: { goalMinutes: number }) {
  const { studyTodaySeconds } = useActivityStatus();
  const goalSeconds = goalMinutes * 60;
  const goalText = goalMinutes % 60 === 0 ? `${goalMinutes / 60}h` : hoursMinutes(goalSeconds);
  return (
    <div className="sidebar-goal">
      <div className="sidebar-goal-label">Obiettivo di oggi</div>
      <div className="sidebar-goal-values">
        <span className="sidebar-goal-done">{hoursMinutes(studyTodaySeconds)}</span>
        <span className="sidebar-goal-label">di {goalText}</span>
      </div>
      <ProgressBar value={Math.min(1, studyTodaySeconds / goalSeconds)} label="Avanzamento dell'obiettivo di oggi" />
    </div>
  );
}

function Sidebar() {
  const { view, goToDashboard, openWidgetDetail, openSettings } = useNav();
  const { settings } = useSettings();
  const logo = useThemeVariant(LOGOS);
  const showGoal = useThemeVariant(SHOW_GOAL) && settings.studyDailyGoalMinutes > 0;

  const item = (label: string, active: boolean, onClick?: () => void) => (
    <button
      type="button"
      className={`nav-item${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span className="nav-item-dot" aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <aside className="sidebar">
      {settings.sidebarShowTitle && (
        <div className="sidebar-logo">
          {logo}
          <span>{settings.dashboardName.trim() || "Personal Dashboard"}</span>
        </div>
      )}

      <nav className="sidebar-nav" aria-label="Navigazione principale">
        {item("Dashboard", view.type === "dashboard", goToDashboard)}
        {item("Tasks", false)}
        {item("Projects", false)}
        {item("Notes", view.type === "widgetDetail" && view.widgetId === "notes", () => openWidgetDetail("notes"))}
      </nav>

      <div className="sidebar-bottom">
        {showGoal && <GoalCard goalMinutes={settings.studyDailyGoalMinutes} />}
        <button
          type="button"
          className={`nav-item setting-button${view.type === "settings" ? " active" : ""}`}
          aria-current={view.type === "settings" ? "page" : undefined}
          onClick={() => openSettings()}
        >
          Impostazioni <MdOutlineSettings aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
