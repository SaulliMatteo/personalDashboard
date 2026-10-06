import { useState } from "react";
import { MdOutlineSettings } from "react-icons/md";
import SettingsModal from "../../pages/SettingsModal";
import { useNav } from "../../context/NavContext";

function Sidebar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { view, goToDashboard } = useNav();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        Personal Dashboard
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item${view.type === "dashboard" ? " active" : ""}`}
          onClick={goToDashboard}
        >
          Dashboard
        </button>

        <button className="nav-item">
          Tasks
        </button>

        <button className="nav-item">
          Projects
        </button>

        <button className="nav-item">
          Notes
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button 
          className="nav-item setting-button"
          onClick={() => setSettingsOpen(true)}
        >
          Settings    <MdOutlineSettings />
        </button>
      </div>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}

export default Sidebar;
