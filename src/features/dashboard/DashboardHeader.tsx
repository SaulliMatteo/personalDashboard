import type { ReactNode } from "react";
import { useSettings } from "../../core/settings/useSettings";
import { useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import HeaderSlots from "./HeaderSlots";
import NotificationBell from "./NotificationBell";
import { useGreeting } from "./useGreeting";
import "./dashboardHeader.css";

/** Classe per tema: le forme dei mockup stanno in dashboardHeader.css. */
const HEADER_CLASS: ThemeVariants<string> = { notte: "dh--notte", opaco: "dh--opaco", quaderno: "dh--quaderno", fosforo: "dh--fosforo" };

/**
 * Intestazione della dashboard: il saluto e, a destra, i mini scelti in Impostazioni > Dashboard e la campanella
 * delle notifiche, poi gli amici (`actions`, da app/App.tsx; docs/mockup/gruppi/amici-notifiche.html). Con la finestra stretta
 * cedono i mini, le icone restano.
 */
function DashboardHeader({ actions }: { actions?: ReactNode }) {
  const { settings } = useSettings();
  const title = useGreeting();
  const headerClass = useThemeVariant(HEADER_CLASS);
  if (!settings.showDashboardHeader) return null;

  // Solo saluto e mini: giorno e ora hanno i loro widget (Data, Orologio).
  return (
    <header className={`dh ${headerClass}`}>
      <h1>{title}</h1>
      <div className="dh-end">
        <HeaderSlots />
        <span className="dh-sep" aria-hidden="true" />
        <NotificationBell />
        {actions}
      </div>
    </header>
  );
}

export default DashboardHeader;
