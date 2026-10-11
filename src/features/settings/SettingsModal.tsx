import { useEffect } from "react";
import "./settingsModal.css";
import WidgetsTab from "./tabs/WidgetsTab";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
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
        <section className="settings-content">
          <button className="settings-close" onClick={onClose} aria-label="Chiudi impostazioni">
            ✕
          </button>

          <h2>Impostazioni</h2>
          <WidgetsTab onClose={onClose} />
        </section>
      </div>
    </div>
  );
}

export default SettingsModal;
