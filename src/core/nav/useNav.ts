import { createContext, useContext } from "react";

/* Contesto e hook separati dal provider: così l'aggiornamento a caldo di Vite non crea
   un secondo contesto quando cambia il file del provider (o qualcosa che importa). */

/**
 * Vista corrente dell'app. Qualunque widget con una pagina di dettaglio
 * si aggancia registrando `detailComponent` nella sua definizione
 * (src/widgets/<nome>/index.ts), senza toccare questo file.
 */
export type AppView =
  | { type: "dashboard" }
  | { type: "catalog" }
  | { type: "settings"; section: string }
  | { type: "widgetDetail"; widgetId: string };

export interface NavContextValue {
  view: AppView;
  goToDashboard: () => void;
  goToCatalog: () => void;
  /** Apre la pagina Impostazioni su una sezione (default "appearance"; per un widget "widget:<id>"). */
  openSettings: (section?: string) => void;
  openWidgetDetail: (widgetId: string) => void;
}

export const NavContext = createContext<NavContextValue | undefined>(undefined);

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav deve essere usato dentro <NavProvider>");
  return ctx;
}
