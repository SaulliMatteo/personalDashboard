import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loadSettings, saveSettings, type AppSettings } from "../database/settingRepository";

interface SettingsContextValue {
  settings: AppSettings | null;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    loadSettings().then((loaded) => {
      settingsRef.current = loaded;
      setSettings(loaded);
    });
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const prev = settingsRef.current;
    if (!prev) return;
    const updated = { ...prev, [key]: value };
    settingsRef.current = updated;
    setSettings(updated);
    // Scritture in coda: una alla volta, nell'ordine in cui sono state fatte.
    saveChain.current = saveChain.current.then(() => saveSettings(updated));
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