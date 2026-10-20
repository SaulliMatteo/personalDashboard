import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

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

interface NavContextValue {
  view: AppView;
  goToDashboard: () => void;
  goToCatalog: () => void;
  /** Apre la pagina Impostazioni su una sezione (default "appearance"; per un widget "widget:<id>"). */
  openSettings: (section?: string) => void;
  openWidgetDetail: (widgetId: string) => void;
}

const NavContext = createContext<NavContextValue | undefined>(undefined);

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AppView>({ type: "dashboard" });

  const value = useMemo<NavContextValue>(
    () => ({
      view,
      goToDashboard: () => setView({ type: "dashboard" }),
      goToCatalog: () => setView({ type: "catalog" }),
      openSettings: (section = "appearance") => setView({ type: "settings", section }),
      openWidgetDetail: (widgetId) => setView({ type: "widgetDetail", widgetId }),
    }),
    [view]
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav deve essere usato dentro <NavProvider>");
  return ctx;
}
