import { useState, useEffect } from "react";
import "../css/SettingsModal.css";
import WidgetSetting from "../components/setting/WidgetSetting";
import type { Dispatch, SetStateAction } from "react";
import type { LayoutItem } from "../database/layoutRepository";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  setLayout: Dispatch<SetStateAction<LayoutItem[]>>;
  }


type SettingsTab = "general" | "appearance" | "widgets" | "about";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "widgets", label: "Widgets" },
  { id: "about", label: "About" },
];

function SettingsModal({ isOpen, onClose, setLayout }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // Chiude con ESC, come in Obsidian
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    // Click sull'overlay chiude, click dentro il modale no (stopPropagation)
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <aside className="settings-sidebar">
          <div className="settings-sidebar-title">Settings</div>
          <nav className="flex flex-col">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`settings-nav-item${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="settings-content">
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>

          {activeTab === "general" && (
            <div>
              <h2>General</h2>
              <p className="note">Impostazioni generali della dashboard.</p>
            </div>
          )}

          {activeTab === "appearance" && (
            <div>
              <h2>Appearance</h2>
              <p className="note">Tema, colori, effetti glow.</p>
            </div>
          )}

          {activeTab === "widgets" && (
            <div>
              <WidgetSetting setLayout={setLayout}></WidgetSetting>
            </div>
          )}

          {activeTab === "about" && (
            <div>
              <h2>About</h2>
              <p className="note">Personal Dashboard — versione locale.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default SettingsModal;