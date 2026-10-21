import { createContext, useContext } from "react";
import type { AppSettings } from "./schema";

/* Contesto e hook separati dal provider: così l'aggiornamento a caldo di Vite non crea
   un secondo contesto quando cambia il file del provider (o qualcosa che importa). */

export interface SettingsContextValue {
  /** Mai null: il provider non renderizza i figli finché le impostazioni non sono caricate. */
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
  /**
   * Applica un oggetto di impostazioni (es. incollato dall'utente): solo le
   * chiavi note e valide vengono accettate, il resto viene scartato.
   */
  importSettings: (raw: Record<string, unknown>) => { applied: number; ignored: number };
}

export const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings deve essere usato dentro <SettingsProvider>");
  return ctx;
}
