import { createElement, type ComponentType } from "react";
import { useNav } from "../../core/nav/useNav";
import AccountTab from "./tabs/AccountTab";
import AppearanceTab from "./tabs/AppearanceTab";
import DashboardTab from "./tabs/DashboardTab";
import GeneralTab from "./tabs/GeneralTab";
import WidgetsTab from "./tabs/WidgetsTab";
import "./settingsPage.css";

/** Sezioni fisse, nell'ordine del mockup impostazioni-aspetto.html (Account, dei Gruppi, in fondo). */
const SECTIONS: { id: string; label: string; component: ComponentType }[] = [
  { id: "appearance", label: "Aspetto", component: AppearanceTab },
  { id: "dashboard", label: "Dashboard", component: DashboardTab },
  { id: "widgets", label: "Widget", component: WidgetsTab },
  { id: "general", label: "Generale", component: GeneralTab },
  { id: "account", label: "Account", component: AccountTab },
];

/**
 * Pagina Impostazioni: elenco delle sezioni a sinistra, contenuto a destra.
 * La sezione aperta sta nella vista (NavContext). "widget:<id>" apre la sezione
 * Widget con le impostazioni di quel widget già aperte nella sua card del catalogo.
 */
function SettingsPage({ section }: { section: string }) {
  const { openSettings } = useNav();
  const widgetId = section.startsWith("widget:") ? section.slice("widget:".length) : null;
  const current = SECTIONS.find((s) => s.id === (widgetId ? "widgets" : section)) ?? SECTIONS[0];

  const navItem = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      className={`sp-nav-item${current.id === id ? " is-active" : ""}`}
      aria-current={current.id === id ? "page" : undefined}
      onClick={() => openSettings(id)}
    >
      {label}
    </button>
  );

  return (
    <section className="sp" aria-label="Impostazioni">
      <nav className="sp-nav" aria-label="Sezioni delle impostazioni">
        <h1 className="sp-title">Impostazioni</h1>
        {SECTIONS.map((s) => navItem(s.id, s.label))}
      </nav>

      {/* key: un nuovo "widget:<id>" rimonta la sezione, così si apre la card giusta. */}
      <div className="sp-content" key={section}>
        {current.id === "widgets" ? <WidgetsTab openWidgetId={widgetId} /> : createElement(current.component)}
      </div>
    </section>
  );
}

export default SettingsPage;
