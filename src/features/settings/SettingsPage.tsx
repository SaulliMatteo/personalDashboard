import { createElement, type ComponentType } from "react";
import { useNav } from "../../core/nav/NavContext";
import { WIDGET_REGISTRY } from "../../widgets/registry";
import AppearanceTab from "./tabs/AppearanceTab";
import DashboardTab from "./tabs/DashboardTab";
import GeneralTab from "./tabs/GeneralTab";
import WidgetsTab from "./tabs/WidgetsTab";
import WidgetTab from "./tabs/WidgetTab";
import "./settingsPage.css";

/** Sezioni fisse, nell'ordine del mockup impostazioni-aspetto.html. */
const SECTIONS: { id: string; label: string; component: ComponentType }[] = [
  { id: "appearance", label: "Aspetto", component: AppearanceTab },
  { id: "dashboard", label: "Dashboard", component: DashboardTab },
  { id: "widgets", label: "Widget", component: WidgetsTab },
  { id: "general", label: "Generale", component: GeneralTab },
];

/** Widget con impostazioni proprie: ognuno ha una voce sotto "Widget" (derivate dal registry). */
const WIDGETS_WITH_SETTINGS = WIDGET_REGISTRY.filter((widget) => widget.settingsGroup);

/**
 * Pagina Impostazioni: elenco delle sezioni a sinistra, contenuto a destra.
 * La sezione aperta sta nella vista (NavContext), così la rotellina del
 * catalogo può portare dritta alle impostazioni di un widget.
 */
function SettingsPage({ section }: { section: string }) {
  const { openSettings } = useNav();
  const widgetId = section.startsWith("widget:") ? section.slice("widget:".length) : null;
  const widget = widgetId ? WIDGETS_WITH_SETTINGS.find((w) => w.id === widgetId) : undefined;
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const activeId = widget ? `widget:${widget.id}` : current.id;

  const navItem = (id: string, label: string, sub = false) => (
    <button
      key={id}
      type="button"
      className={`sp-nav-item${sub ? " sp-nav-item--sub" : ""}${activeId === id ? " is-active" : ""}`}
      aria-current={activeId === id ? "page" : undefined}
      onClick={() => openSettings(id)}
    >
      {label}
    </button>
  );

  return (
    <section className="sp" aria-label="Impostazioni">
      <nav className="sp-nav" aria-label="Sezioni delle impostazioni">
        <h1 className="sp-title">Impostazioni</h1>
        {SECTIONS.map((s) => (
          <div key={s.id} className="sp-nav-group">
            {navItem(s.id, s.label)}
            {s.id === "widgets" && WIDGETS_WITH_SETTINGS.map((w) => navItem(`widget:${w.id}`, w.name, true))}
          </div>
        ))}
      </nav>

      <div className="sp-content">{widget ? <WidgetTab widget={widget} /> : createElement(current.component)}</div>
    </section>
  );
}

export default SettingsPage;
