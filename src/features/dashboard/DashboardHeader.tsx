import { useSettings } from "../../core/settings/useSettings";
import { useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import HeaderSlots from "./HeaderSlots";
import { useGreeting } from "./useGreeting";
import "./dashboardHeader.css";

/** Classe per tema: le forme dei mockup stanno in dashboardHeader.css. */
const HEADER_CLASS: ThemeVariants<string> = { notte: "dh--notte", opaco: "dh--opaco", quaderno: "dh--quaderno", fosforo: "dh--fosforo" };

/** Intestazione della dashboard: il saluto e, a destra, i mini scelti in Impostazioni > Dashboard. */
function DashboardHeader() {
  const { settings } = useSettings();
  const title = useGreeting();
  const headerClass = useThemeVariant(HEADER_CLASS);
  if (!settings.showDashboardHeader) return null;

  // Solo saluto e mini: giorno e ora hanno i loro widget (Data, Orologio).
  return (
    <header className={`dh ${headerClass}`}>
      <h1>{title}</h1>
      <HeaderSlots />
    </header>
  );
}

export default DashboardHeader;
