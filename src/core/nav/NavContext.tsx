import { useEffect, useMemo, useState, type ReactNode } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { isAndroid } from "../system/platform";
import { onNotificationOpen } from "../notify/notifier";
import { useLatestRef } from "../hooks/useLatestRef";
import { runBackHandler, useBackHandlerCount } from "./backHandlers";
import { closeTopOverlay, useOverlayOpen } from "./overlays";
import { onFriendsPanelShow, requestFriendsPanel } from "./friendsPanel";
import { NavContext, viewOfNotification, type NavContextValue, type AppView } from "./useNav";
import type { NotificationOpen } from "../notify/notifier";

/** La vista della notifica; per gli amici anche il pannello (che sta nella dashboard: ci si torna da soli). */
function showNotification(open: NotificationOpen, setView: (view: AppView) => void) {
  setView(viewOfNotification(open));
  if (open.type === "friends") requestFriendsPanel(open.userId ? { userId: open.userId } : { add: true });
}

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
      openNotification: (open) => showNotification(open, setView),
    }),
    [view]
  );

  // Il pannello degli amici (link, notifica) si apre dalla dashboard.
  useEffect(() => onFriendsPanelShow(() => setView({ type: "dashboard" })), []);

  // Tocco su una notifica (Android): apre la pagina che la notifica indica (Studio, Stanza comune, amici).
  useEffect(
    () =>
      onNotificationOpen((open) => {
        showNotification(open, setView);
      }),
    []
  );

  // Indietro di Android: prima lo schermo intero o il dialogo in cima (overlays.ts), poi chi ha qualcosa da chiudere
  // (backHandlers.ts), poi la dashboard. Il listener c'è solo quando serve: senza, Android fa da sé (dalla dashboard
  // chiude l'app).
  const android = isAndroid();
  const handlers = useBackHandlerCount();
  const overlay = useOverlayOpen(android);
  const needsBack = android && (view.type !== "dashboard" || handlers > 0 || overlay);
  const onBack = useLatestRef(() => {
    const goBack = () => {
      if (!runBackHandler()) setView({ type: "dashboard" });
    };
    if (overlay) closeTopOverlay(goBack);
    else goBack();
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
