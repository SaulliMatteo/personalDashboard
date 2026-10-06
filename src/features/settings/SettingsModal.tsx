import { useState, useEffect } from "react";
import "./settingsModal.css";
import SettingsSection from "../../core/settings/components/SettingsSection";
import GeneralTab from "./tabs/GeneralTab";
import WidgetsTab from "./tabs/WidgetsTab";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = "general" | "appearance" | "glow" | "dashboard" | "widgets" | "about";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "Generale" },
  { id: "appearance", label: "Aspetto" },
  { id: "glow", label: "Effetti" },
  { id: "dashboard", label: "Dashboard" },
  { id: "widgets", label: "Widget" },
  { id: "about", label: "Informazioni" },
];

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

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
          <div className="settings-sidebar-title">Impostazioni</div>
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
          <button className="settings-close" onClick={onClose} aria-label="Chiudi impostazioni">
            ✕
          </button>

          {activeTab === "general" && <GeneralTab />}

          {activeTab === "appearance" && (
            <div>
              <h2>Aspetto</h2>
              <p className="note">Tema, colori, forme, tipografia e barra laterale.</p>
              <SettingsSection group="appearance" />
            </div>
          )}

          {activeTab === "glow" && (
            <div>
              <h2>Effetti</h2>
              <p className="note">Il bordo luminoso dei widget: colori, intensità e forma.</p>
              <SettingsSection group="glow" />
            </div>
          )}

          {activeTab === "dashboard" && (
            <div>
              <h2>Dashboard</h2>
              <p className="note">Intestazione, griglia, trascinamento e anteprima di spostamento.</p>
              <SettingsSection group="dashboard" />
            </div>
          )}

          {activeTab === "widgets" && (
            <div>
              <h2>Widget</h2>
              <WidgetsTab onClose={onClose} />
            </div>
          )}

          {activeTab === "about" && (
            <div>
              <h2>Informazioni</h2>
              <p className="note">Personal Dashboard — versione locale.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default SettingsModal;
