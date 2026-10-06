import type { ReactNode } from "react";
import Sidebar from "../sideBar/Sidebar";
import { useSettings } from "../../context/SettingContext";

interface AppShellProps {
  children: ReactNode;
}

/**
 * Guscio comune a Dashboard e WidgetCatalog: la sidebar (con dentro il
 * modale Settings) resta sempre montata e visibile, cambia solo il
 * contenuto di .main. Prima questo <div className="app"> viveva dentro
 * Dashboard.tsx, ma con due pagine serve un contenitore condiviso più in
 * alto, altrimenti passare a WidgetCatalog farebbe sparire anche la
 * sidebar invece della sola dashboard.
 */
function AppShell({ children }: AppShellProps) {
  const { settings } = useSettings();

  return (
    <div className={`app ${settings?.theme === "light" ? "theme-light" : "theme-dark"}`}>
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  );
}

export default AppShell;
