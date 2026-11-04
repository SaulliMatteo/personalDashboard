import { useEffect, useMemo, useState, type ReactNode } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { isAndroid } from "../system/platform";
import { useLatestRef } from "../hooks/useLatestRef";
import { runBackHandler, useBackHandlerCount } from "./backHandlers";
import { NavContext, type NavContextValue, type AppView } from "./useNav";

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AppView>({ type: "dashboard" });

  const value = useMemo<NavContextValue>(
    () => ({
      view,
      goToDashboard: () => setView({ type: "dashboard" }),
      goToCatalog: () => setView({ type: "catalog" }),
      openRoom: () => setView({ type: "room" }),
      openSettings: (section = "appearance") => setView({ type: "settings", section }),
      openWidgetDetail: (widgetId) => setView({ type: "widgetDetail", widgetId }),
    }),
    [view]
  );

  // Indietro di Android: prima chi ha qualcosa da chiudere (backHandlers.ts), poi la dashboard. Il listener
  // c'è solo quando serve: senza, Android fa da sé (dalla dashboard chiude l'app).
  const handlers = useBackHandlerCount();
  const needsBack = isAndroid() && (view.type !== "dashboard" || handlers > 0);
  const onBack = useLatestRef(() => {
    if (!runBackHandler()) setView({ type: "dashboard" });
  });
  useEffect(() => {
    if (!needsBack) return;
    let cancelled = false;
    let unregister: (() => void) | null = null;
    onBackButtonPress(() => onBack.current())
      .then((listener) => {
        if (cancelled) void listener.unregister();
        else unregister = () => void listener.unregister();
      })
      .catch((error) => console.error("Tasto indietro non agganciato:", error));
    return () => {
      cancelled = true;
      unregister?.();
    };
  }, [needsBack, onBack]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}
