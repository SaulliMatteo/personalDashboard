import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_SETTINGS, type AppSettings } from "./schema";
import { loadSettings, saveSettingsPatch, clearSettings } from "./settingsRepository";
import { applySettingsToDocument } from "./applySettings";

// Gli slider emettono molti valori al secondo: li raccogliamo e scriviamo
// una volta sola quando l'utente si ferma.
const SAVE_DEBOUNCE_MS = 300;

interface SettingsContextValue {
  /** Mai null: il provider non renderizza i figli finché le impostazioni non sono caricate. */
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  const pending = useRef<Partial<AppSettings>>({});
  const timer = useRef<number | null>(null);
  const writeChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((loaded) => {
      if (cancelled) return;
      settingsRef.current = loaded;
      setSettings(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Applica tema/accent/animazioni PRIMA del paint, per evitare un flash.
  useLayoutEffect(() => {
    if (settings) applySettingsToDocument(settings);
  }, [settings]);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    // Scritture in coda: una alla volta, nell'ordine in cui sono state fatte.
    writeChain.current = writeChain.current.then(() => saveSettingsPatch(patch));
  }, []);

  // Se la finestra viene nascosta/chiusa prima dello scadere del debounce,
  // scriviamo subito quello che è in sospeso.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [flush]);

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      const updated = { ...settingsRef.current, [key]: value };
      settingsRef.current = updated;
      setSettings(updated);

      pending.current = { ...pending.current, [key]: value };
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  const resetSettings = useCallback(() => {
    pending.current = {};
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const defaults = { ...DEFAULT_SETTINGS };
    settingsRef.current = defaults;
    setSettings(defaults);
    writeChain.current = writeChain.current.then(clearSettings);
  }, []);

  const value = useMemo(
    () => (settings ? { settings, updateSetting, resetSettings } : null),
    [settings, updateSetting, resetSettings]
  );

  if (!value) return null;
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings deve essere usato dentro <SettingsProvider>");
  return ctx;
}
