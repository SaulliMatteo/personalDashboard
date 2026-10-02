import { useState, useEffect } from "react";
import "./settingsModal.css";
import SettingsSection from "../../core/settings/components/SettingsSection";
import ConfirmButton from "../../ui/ConfirmButton";
import { useSettings } from "../../core/settings/SettingsContext";
import WidgetsTab from "./tabs/WidgetsTab";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = "general" | "appearance" | "dashboard" | "widgets" | "about";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "dashboard", label: "Dashboard" },
  { id: "widgets", label: "Widgets" },
  { id: "about", label: "About" },
];

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { resetSettings } = useSettings();

  // Chiude con ESC
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
          <nav className="settings-nav">
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
              <div className="settings-option">
                <span>Ripristina tutte le impostazioni ai valori di default (il layout dei widget non cambia)</span>
                <ConfirmButton className="settings-btn" label="Ripristina" onConfirm={resetSettings} />
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div>
              <h2>Appearance</h2>
              <p className="note">Tema, colori, animazioni ed effetti glow.</p>
              <SettingsSection group="appearance" />
            </div>
          )}

          {activeTab === "dashboard" && (
            <div>
              <h2>Dashboard</h2>
              <p className="note">Comportamento e proporzioni della griglia.</p>
              <SettingsSection group="dashboard" />
            </div>
          )}

          {activeTab === "widgets" && (
            <div>
              <h2>Widgets</h2>
              <WidgetsTab onClose={onClose} />
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
