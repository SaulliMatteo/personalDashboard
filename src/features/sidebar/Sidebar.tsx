import { useState } from "react";
import { MdOutlineSettings } from "react-icons/md";
import "./sidebar.css";
import SettingsModal from "../settings/SettingsModal";
import { useNav } from "../../core/nav/NavContext";
import { useSettings } from "../../core/settings/SettingsContext";

function Sidebar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { view, goToDashboard } = useNav();
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
        <button className="nav-item">Notes</button>
      </nav>

      <div className="sidebar-bottom">
        <button className="nav-item setting-button" onClick={() => setSettingsOpen(true)}>
          Impostazioni <MdOutlineSettings />
        </button>
      </div>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}

export default Sidebar;
