import { useNow } from "../../core/hooks/useNow";
import { useSettings } from "../../core/settings/useSettings";

function timeGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "Buonanotte";
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

/** Il saluto della dashboard (Impostazioni > Dashboard), per l'intestazione del desktop e la barra del telefono. */
export function useGreeting(): string {
  const { settings } = useSettings();
  const now = useNow();
  const name = settings.userName.trim();
  if (settings.dashboardGreeting === "welcome") return name ? `Ciao, ${name}` : "Ciao";
  if (settings.dashboardGreeting === "time") return name ? `${timeGreeting(now)}, ${name}` : timeGreeting(now);
  return "Dashboard";
}
