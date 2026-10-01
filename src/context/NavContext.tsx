import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Vista corrente dell'app. Generalizzata a "widgetDetail" (invece di un
 * caso spot tipo "studyDetail") perché lo Studio non sarà probabilmente
 * l'unico widget a volere una pagina di dettaglio: qualunque widget futuro
 * si aggancia allo stesso meccanismo registrando un detailComponent in
 * src/widgets/registry.tsx, senza dover toccare di nuovo questo file.
 */
export type AppView =
  | { type: "dashboard" }
  | { type: "catalog" }
  | { type: "widgetDetail"; widgetId: string };

interface NavContextValue {
  view: AppView;
  goToDashboard: () => void;
  goToCatalog: () => void;
  openWidgetDetail: (widgetId: string) => void;
}

const NavContext = createContext<NavContextValue | undefined>(undefined);

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AppView>({ type: "dashboard" });

  return (
    <NavContext.Provider
      value={{
        view,
        goToDashboard: () => setView({ type: "dashboard" }),
        goToCatalog: () => setView({ type: "catalog" }),
        openWidgetDetail: (widgetId: string) => setView({ type: "widgetDetail", widgetId }),
      }}
    >
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav deve essere usato dentro <NavProvider>");
  return ctx;
}
