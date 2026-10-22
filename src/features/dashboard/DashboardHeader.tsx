import { useNow } from "../../core/hooks/useNow";
import { useSettings } from "../../core/settings/useSettings";
import { useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import HeaderSlots from "./HeaderSlots";
import "./dashboardHeader.css";

function timeGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "Buonanotte";
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

/** Classe per tema: le forme dei mockup stanno in dashboardHeader.css. */
const HEADER_CLASS: ThemeVariants<string> = { notte: "dh--notte", opaco: "dh--opaco", quaderno: "dh--quaderno", fosforo: "dh--fosforo" };

/** Intestazione della dashboard: il saluto e, a destra, i mini scelti in Impostazioni > Dashboard. */
function DashboardHeader() {
  const { settings } = useSettings();
  const now = useNow();
  const headerClass = useThemeVariant(HEADER_CLASS);
  if (!settings.showDashboardHeader) return null;

  const name = settings.userName.trim();
  let title = "Dashboard";
  if (settings.dashboardGreeting === "welcome") title = name ? `Ciao, ${name}` : "Ciao";
  else if (settings.dashboardGreeting === "time") title = name ? `${timeGreeting(now)}, ${name}` : timeGreeting(now);

  // Solo saluto e mini: giorno e ora hanno i loro widget (Data, Orologio).
  return (
    <header className={`dh ${headerClass}`}>
      <h1>{title}</h1>
      <HeaderSlots />
    </header>
  );
}

export default DashboardHeader;
