import { createElement } from "react";
import { useActivityStatus } from "../../core/activity/activityBus";
import { useNow } from "../../core/hooks/useNow";
import { useSettings } from "../../core/settings/useSettings";
import { useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import { clockText, dateText } from "../../core/time/format";
import HeaderSlots from "./HeaderSlots";
import "./dashboardHeader.css";

function timeGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "Buonanotte";
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

/** "Hai studiato 2 ore e 5 minuti." (Quaderno). */
function studiedText(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "Oggi non hai ancora studiato.";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [];
  if (h > 0) parts.push(h === 1 ? "1 ora" : `${h} ore`);
  if (m > 0) parts.push(m === 1 ? "1 minuto" : `${m} minuti`);
  return `Hai studiato ${parts.join(" e ")}.`;
}

interface HeaderProps {
  title: string;
  now: Date;
  studySeconds: number;
}

// ------------------------------------------------------------ Notte

function HeaderNotte({ title, now }: HeaderProps) {
  return (
    <header className="dh dh--notte">
      <div>
        <h1>{title}</h1>
        <p>
          {dateText(now)}, {clockText(now)}
        </p>
      </div>
      <HeaderSlots />
    </header>
  );
}

// ------------------------------------------------------------ Opaco

function HeaderOpaco({ title, now }: HeaderProps) {
  return (
    <header className="dh dh--opaco">
      <h1>{title}</h1>
      <p>{dateText(now)}</p>
      <HeaderSlots />
    </header>
  );
}

// ------------------------------------------------------------ Quaderno

function HeaderQuaderno({ title, now, studySeconds }: HeaderProps) {
  return (
    <header className="dh dh--quaderno">
      <h1>{title}</h1>
      <p>
        {dateText(now)}. {studiedText(studySeconds)}
      </p>
      <HeaderSlots />
    </header>
  );
}

// ------------------------------------------------------------ Fosforo

function HeaderFosforo({ title, now }: HeaderProps) {
  return (
    <header className="dh dh--fosforo">
      <div>
        <h1>{title}</h1>
        <p>{dateText(now)}</p>
      </div>
      <HeaderSlots />
    </header>
  );
}

const HEADERS: ThemeVariants<(props: HeaderProps) => React.JSX.Element> = {
  notte: HeaderNotte,
  opaco: HeaderOpaco,
  quaderno: HeaderQuaderno,
  fosforo: HeaderFosforo,
};

/** Intestazione della dashboard: saluto, data e, a seconda del tema, giornata di studio o orologio. */
function DashboardHeader() {
  const { settings } = useSettings();
  const activity = useActivityStatus();
  const now = useNow();
  const Header = useThemeVariant(HEADERS);
  if (!settings.showDashboardHeader) return null;

  const name = settings.userName.trim();
  let title = "Dashboard";
  if (settings.dashboardGreeting === "welcome") title = name ? `Ciao, ${name}` : "Ciao";
  else if (settings.dashboardGreeting === "time") title = name ? `${timeGreeting(now)}, ${name}` : timeGreeting(now);

  return createElement(Header, { title, now, studySeconds: activity.studyTodaySeconds });
}

export default DashboardHeader;
