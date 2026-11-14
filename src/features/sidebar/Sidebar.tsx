import type { ReactNode } from "react";
import { MdOutlineSettings } from "react-icons/md";
import "./sidebar.css";
import { useActivityStatus } from "../../core/activity/activityBus";
import { useNav } from "../../core/nav/useNav";
import { useSettings } from "../../core/settings/useSettings";
import { perMode, useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import ProgressBar from "../../ui/ProgressBar";
import "../../ui/runes.css";

/** Simbolo accanto al titolo dell'app, uno per tema (mockup). */
const LOGOS: ThemeVariants<React.JSX.Element | null> = {
  notte: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  ),
  opaco: null,
  quaderno: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 9h16M4 15h16M10 3v18" />
    </svg>
  ),
  fosforo: <span className="sidebar-logo-dot" aria-hidden="true" />,
  // Vetro: una goccia con il riflesso.
  vetro: (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="sb-logo-vetro" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <path d="M12 2.5c3.5 4.4 6.5 7.9 6.5 11.5a6.5 6.5 0 0 1-13 0c0-3.6 3-7.1 6.5-11.5z" fill="url(#sb-logo-vetro)" />
      <path d="M9 13.5a3.3 3.3 0 0 0 2.4 3.6" stroke="var(--on-accent)" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".8" />
    </svg>
  ),
  // Ombra: eclisse di notte, stella di giorno.
  ombra: perMode({
    notte: (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <filter id="sb-logo-ombra" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>
        <circle cx="12" cy="12" r="7.6" fill="var(--core-glow)" filter="url(#sb-logo-ombra)" />
        <circle cx="12" cy="12" r="7" fill="var(--core-fill)" />
        <circle cx="12" cy="12" r="7" fill="none" stroke="var(--core-glow)" strokeWidth=".6" />
      </svg>
    ),
    giorno: (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <filter id="sb-logo-fiamma" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>
        <path d="M12 1.5l2.2 8.3 8.3 2.2-8.3 2.2L12 22.5l-2.2-8.3L1.5 12l8.3-2.2z" fill="var(--core-glow)" filter="url(#sb-logo-fiamma)" />
        <path d="M12 3l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8z" fill="var(--core-fill)" stroke="var(--accent-2)" strokeWidth=".5" />
      </svg>
    ),
  }),
};

/** La card in fondo alla barra laterale: "Obiettivo di oggi" in Notte e Vetro, le rune in Ombra (mockup). */
const SIDE_CARD: ThemeVariants<"goal" | "runes" | null> = { notte: "goal", opaco: null, quaderno: null, fosforo: null, vetro: "goal", ombra: "runes" };

/** "2h 05m". */
function hoursMinutes(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Obiettivo di studio di oggi: dati dall'activityBus, pubblicati dallo Studio. */
function GoalCard({ goalSeconds }: { goalSeconds: number }) {
  const { studyTodaySeconds } = useActivityStatus();
  const goalMinutes = Math.round(goalSeconds / 60);
  const goalText = goalMinutes % 60 === 0 ? `${goalMinutes / 60}h` : hoursMinutes(goalSeconds);
  return (
    <div className="sidebar-goal">
      <div className="sidebar-goal-label">Obiettivo di oggi</div>
      <div className="sidebar-goal-values">
        <span className="sidebar-goal-done">{hoursMinutes(studyTodaySeconds)}</span>
        <span className="sidebar-goal-label">di {goalText}</span>
      </div>
      <ProgressBar value={Math.min(1, studyTodaySeconds / goalSeconds)} label="Avanzamento dell'obiettivo di oggi" />
    </div>
  );
}

/** Ombra: le rune della progressione dello Studio (dal bus delle attività); apre la scheda Rune. */
function RunesCard() {
  const { studyProgress: p } = useActivityStatus();
  const { settings } = useSettings();
  const { openWidgetDetail } = useNav();
  if (!p) return null;
  return (
    <button type="button" className="sidebar-goal sidebar-runes" onClick={() => openWidgetDetail("study", "runes")} aria-label={`Le tue rune: livello ${p.levelText}. ${p.nextText}`}>
      <dl className="runes">
        <dt>Nome:</dt>
        <dd>{settings.userName.trim() || "Tu"}</dd>
        <dt>Livello:</dt>
        <dd>{p.levelText}</dd>
        <dt>Serie:</dt>
        <dd>{p.gradeText || "nessuna"}</dd>
        <dt>Nuclei:</dt>
        <dd>{p.fullCores}/7</dd>
        {p.coreCap > 0 && (
          <>
            <dt>Frammenti:</dt>
            <dd>
              {p.coreFill}/{p.coreCap}
            </dd>
          </>
        )}
      </dl>
      {p.coreCap > 0 && <ProgressBar value={p.coreFill / p.coreCap} label="Riempimento del nucleo" />}
      <span className="sidebar-runes-next">{p.nextText}</span>
    </button>
  );
}

/** `extraNav`: voci in più sotto "Dashboard", passate da app/ (es. la Stanza comune dei Gruppi). */
function Sidebar({ extraNav }: { extraNav?: ReactNode }) {
  const { view, goToDashboard, openSettings } = useNav();
  const { settings } = useSettings();
  const logo = useThemeVariant(LOGOS);
  // L'obiettivo di oggi lo calcola lo Studio (materie di oggi o impostazione generale): 0 = nessun obiettivo.
  const { studyTodayGoalSeconds } = useActivityStatus();
  const sideCard = useThemeVariant(SIDE_CARD);
  const showGoal = sideCard === "goal" && studyTodayGoalSeconds > 0;

  const item = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      className={`nav-item${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span className="nav-item-dot" aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <aside className="sidebar">
      {settings.sidebarShowTitle && (
        <div className="sidebar-logo">
          {logo}
          <span>{settings.dashboardName.trim() || "Personal Dashboard"}</span>
        </div>
      )}

      <nav className="sidebar-nav" aria-label="Navigazione principale">
        {item("Dashboard", view.type === "dashboard", goToDashboard)}
        {extraNav}
      </nav>

      <div className="sidebar-bottom">
        {showGoal && <GoalCard goalSeconds={studyTodayGoalSeconds} />}
        {sideCard === "runes" && <RunesCard />}
        <button
          type="button"
          className={`nav-item setting-button${view.type === "settings" ? " active" : ""}`}
          aria-current={view.type === "settings" ? "page" : undefined}
          onClick={() => openSettings()}
        >
          Impostazioni <MdOutlineSettings aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
