import { useSettings } from "../../core/settings/SettingsContext";

function timeGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

/** Intestazione della dashboard: titolo + saluto, entrambi opzionali da settings. */
function DashboardHeader() {
  const { settings } = useSettings();
  if (!settings.showDashboardHeader) return null;

  const name = settings.userName.trim();
  let greeting: string | null = null;
  if (settings.dashboardGreeting === "welcome") {
    greeting = name ? `Welcome back, ${name}.` : "Welcome back.";
  } else if (settings.dashboardGreeting === "time") {
    greeting = name ? `${timeGreeting(new Date())}, ${name}.` : `${timeGreeting(new Date())}.`;
  }

  return (
    <header className="dashboard-header">
      <div>
        <h1>Dashboard</h1>
        {greeting && <p>{greeting}</p>}
      </div>
    </header>
  );
}

export default DashboardHeader;
