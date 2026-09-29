import { createContext, useContext, useState, type ReactNode } from "react";

export type AppView = "dashboard" | "catalog";

interface NavContextValue {
  view: AppView;
  goToDashboard: () => void;
  goToCatalog: () => void;
}

const NavContext = createContext<NavContextValue | undefined>(undefined);

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AppView>("dashboard");

  return (
    <NavContext.Provider
      value={{
        view,
        goToDashboard: () => setView("dashboard"),
        goToCatalog: () => setView("catalog"),
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
