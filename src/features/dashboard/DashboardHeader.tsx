import { createElement } from "react";
import { useActivityStatus, type StudySpan } from "../../core/activity/activityBus";
import { useNow } from "../../core/hooks/useNow";
import { useSettings } from "../../core/settings/SettingsContext";
import { useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import "./dashboardHeader.css";

function timeGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "Buonanotte";
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

/** "Martedì 20 ottobre". */
function dateText(date: Date): string {
  const text = date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "21:48". */
function clockText(date: Date): string {
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
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
  spans: readonly StudySpan[];
}

// ------------------------------------------------------------ Notte

/** Linea della giornata: dalle 7 a mezzanotte, come nel mockup (etichette 8, 12, 16, 20, 24). */
const DAY_START_H = 7;
const DAY_HOURS = 17;
const HOUR_LABELS = [8, 12, 16, 20, 24];

function dayPercent(ms: number, midnight: number): number {
  const hours = (ms - midnight) / 3_600_000;
  return Math.max(0, Math.min(100, ((hours - DAY_START_H) / DAY_HOURS) * 100));
}

function Timeline({ now, spans }: { now: Date; spans: readonly StudySpan[] }) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const count = spans.length;
  return (
    <div className="dh-timeline">
      <div className="dh-timeline-head">
        <span>La tua giornata</span>
        <span>{count === 1 ? "1 sessione" : `${count} sessioni`}</span>
      </div>
      <div className="dh-timeline-track" role="img" aria-label={`Sessioni di studio di oggi: ${count}`}>
        {spans.map((span) => {
          const left = dayPercent(span.start, midnight);
          const width = Math.max(0.6, dayPercent(span.end, midnight) - left);
          return <span key={span.start} className="dh-timeline-span" style={{ left: `${left}%`, width: `${width}%` }} />;
        })}
        <span className="dh-timeline-now" style={{ left: `${dayPercent(now.getTime(), midnight)}%` }} />
      </div>
      <div className="dh-timeline-hours" aria-hidden="true">
        {HOUR_LABELS.map((h) => (
          <span key={h} style={{ left: `${((h - DAY_START_H) / DAY_HOURS) * 100}%` }}>
            {h}
          </span>
        ))}
      </div>
    </div>
  );
}

function HeaderNotte({ title, now, spans }: HeaderProps) {
  return (
    <header className="dh dh--notte">
      <div>
        <h1>{title}</h1>
        <p>
          {dateText(now)}, {clockText(now)}
        </p>
      </div>
      <Timeline now={now} spans={spans} />
    </header>
  );
}

// ------------------------------------------------------------ Opaco

function HeaderOpaco({ title, now }: HeaderProps) {
  return (
    <header className="dh dh--opaco">
      <h1>{title}</h1>
      <p>{dateText(now)}</p>
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
      <time className="dh-clock" dateTime={now.toISOString()}>
        {clockText(now)}
      </time>
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

  return createElement(Header, { title, now, studySeconds: activity.studyTodaySeconds, spans: activity.studyTodaySpans });
}

export default DashboardHeader;
