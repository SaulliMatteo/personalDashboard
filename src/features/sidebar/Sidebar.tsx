import { MdOutlineSettings } from "react-icons/md";
import "./sidebar.css";
import { useNav } from "../../core/nav/NavContext";
import { useSettings } from "../../core/settings/SettingsContext";

function Sidebar() {
  const { view, goToDashboard, openWidgetDetail, openSettings } = useNav();
  const { settings } = useSettings();


  return (
    <aside className="sidebar">
      {settings.sidebarShowTitle && (
        <div className="sidebar-logo">{settings.dashboardName.trim() || "Personal Dashboard"}</div>
      )}

      <nav className="sidebar-nav">
        <button className={`nav-item${view.type === "dashboard" ? " active" : ""}`} onClick={goToDashboard}>
          Dashboard
        </button>

        <button className="nav-item">Tasks</button>
        <button className="nav-item">Projects</button>
        <button
          className={`nav-item${view.type === "widgetDetail" && view.widgetId === "notes" ? " active" : ""}`}
          onClick={() => openWidgetDetail("notes")}
        >
          Notes
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button
          className={`nav-item setting-button${view.type === "settings" ? " active" : ""}`}
          aria-current={view.type === "settings" ? "page" : undefined}
          onClick={() => openSettings()}
        >
          Impostazioni <MdOutlineSettings />
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
