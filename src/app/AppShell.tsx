import type { ReactNode } from "react";
import Sidebar from "../features/sidebar/Sidebar";
import "./shell.css";

/**
 * Guscio comune a tutte le viste: la sidebar (con il modale Settings)
 * resta sempre montata, cambia solo il contenuto di .main.
 * Tema, accent e animazioni sono gestiti su <html> da SettingsProvider.
 */
function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  );
}

export default AppShell;
