import { createContext, useContext } from "react";
import type { NotificationOpen } from "../notify/notifier";

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
  /** Stanza comune dei Gruppi (src/social/room/). */
  | { type: "room" }
  | { type: "settings"; section: string }
  | { type: "widgetDetail"; widgetId: string };

export interface NavContextValue {
  view: AppView;
  goToDashboard: () => void;
  goToCatalog: () => void;
  openRoom: () => void;
  /** Apre la pagina Impostazioni su una sezione (default "appearance"; per un widget "widget:<id>"). */
  openSettings: (section?: string) => void;
  openWidgetDetail: (widgetId: string) => void;
  /** Apre ciò di cui parla una notifica (tocco su Android, clic nella campanella). */
  openNotification: (open: NotificationOpen) => void;
}

/** La vista che apre una notifica. */
export function viewOfNotification(open: NotificationOpen): AppView {
  if (open.type === "room") return { type: "room" };
  if (open.type === "settings") return { type: "settings", section: open.section };
  // il pannello degli amici si apre dalla dashboard (lo chiede NavContext con requestFriendsPanel)
  if (open.type === "friends") return { type: "dashboard" };
  return { type: "widgetDetail", widgetId: open.widgetId };
}

export const NavContext = createContext<NavContextValue | undefined>(undefined);

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav deve essere usato dentro <NavProvider>");
  return ctx;
}
