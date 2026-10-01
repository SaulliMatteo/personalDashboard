import { useState, useEffect } from "react";
import "../css/SettingsModal.css";
import WidgetSetting from "../components/setting/WidgetSetting";
import type { AppSettings } from "../database/settingRepository";
import { useSettings } from "../context/SettingContext";


interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}


type SettingsTab = "general" | "appearance" | "widgets" | "about";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "widgets", label: "Widgets" },
  { id: "about", label: "About" },
];

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // Impostazioni condivise con tutta l'app tramite il context: leggerle/
  // aggiornarle da qui aggiorna automaticamente anche la Dashboard,
  // senza bisogno di ricaricare o passare props manualmente.
  const { settings, updateSetting } = useSettings();

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

              {!settings ? (
                <p className="note">Caricamento…</p>
              ) : (
                <div className="settings-fields">
                  <label className="settings-field">
                    <span>Tema</span>
                    <select
                      value={settings.theme}
                      onChange={(e) =>
                        updateSetting("theme", e.target.value as AppSettings["theme"])
                      }
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </label>

                  <label className="settings-field settings-field--checkbox">
                    <input
                      type="checkbox"
                      checked={settings.glowEnabled}
                      onChange={(e) => updateSetting("glowEnabled", e.target.checked)}
                    />
                    <span>Effetto glow sui widget</span>
                  </label>

                  <label className="settings-field">
                    <span>Margine griglia: {settings.gridMargin}px</span>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={settings.gridMargin}
                      onChange={(e) =>
                        updateSetting("gridMargin", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {activeTab === "widgets" && (
            <div>
              <WidgetSetting onClose={onClose} />
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