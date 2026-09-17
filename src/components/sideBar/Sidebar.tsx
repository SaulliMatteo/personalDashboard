import { useState } from "react";
import { MdOutlineSettings } from "react-icons/md";
import SettingsModal from "../../pages/SettingsModal";
import type { Dispatch, SetStateAction } from "react";
import type { LayoutItem } from "../../database/layoutRepository";

interface SidebarProps {
  setLayout: Dispatch<SetStateAction<LayoutItem[]>>;
}

function Sidebar({setLayout} : SidebarProps) {
  
  
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        Personal Dashboard
      </div>

      <nav className="sidebar-nav">
        <button className="nav-item active">
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
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} setLayout={setLayout} />
    </aside>
  );
}

export default Sidebar;