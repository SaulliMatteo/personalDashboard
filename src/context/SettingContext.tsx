import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadSettings, saveSettings, type AppSettings } from "../database/settingRepository";

interface SettingsContextValue {
  settings: AppSettings | null;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Carica le impostazioni una sola volta, all'avvio dell'app
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  // Aggiorna lo stato subito (tutti i componenti che leggono il context
  // si aggiornano automaticamente) e persiste su disco in background
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

// Hook comodo per leggere/modificare le impostazioni da qualsiasi componente
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings deve essere usato dentro <SettingsProvider>");
  return ctx;
}