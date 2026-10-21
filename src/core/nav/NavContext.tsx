import { useMemo, useState, type ReactNode } from "react";
import { NavContext, type NavContextValue, type AppView } from "./useNav";

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
