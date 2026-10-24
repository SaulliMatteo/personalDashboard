import type { ReactNode } from "react";
import Sidebar from "../features/sidebar/Sidebar";
import RoomNavItem from "../social/room/RoomNavItem";
import "./shell.css";

/**
 * Guscio comune a tutte le viste: la sidebar (con il modale Settings)
 * resta sempre montata, cambia solo il contenuto di .main.
 * Tema, accent e animazioni sono gestiti su <html> da SettingsProvider.
 */
function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      {/* Decorazione di sfondo del tema (oggi solo Fosforo: due cerchi). */}
      <div className="app-deco" aria-hidden="true">
        <span className="app-deco-fill" />
        <span className="app-deco-ring" />
      </div>
      <Sidebar extraNav={<RoomNavItem />} />
      <main className="main">{children}</main>
    </div>
  );
}

export default AppShell;
