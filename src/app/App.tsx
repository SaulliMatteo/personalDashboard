import { SettingsProvider } from "../core/settings/SettingsContext";
import { LayoutProvider } from "../core/layout/LayoutContext";
import { NavProvider, useNav } from "../core/nav/NavContext";
import WidgetProviders from "../widgets/WidgetProviders";
import { getWidget, widgetPigment } from "../widgets/registry";
import Dashboard from "../features/dashboard/Dashboard";
import WidgetCatalog from "../features/catalog/WidgetCatalog";
import DatabaseGate from "./DatabaseGate";
import AppShell from "./AppShell";
import BootGate from "./BootGate";

function CurrentView() {
  const { view } = useNav();

  let content;
  if (view.type === "dashboard") {
    content = <Dashboard />;
  } else if (view.type === "catalog") {
    content = <WidgetCatalog />;
  } else {
    // Qualunque widget con una pagina propria si aggancia qui registrando
    // `detailComponent` nella sua definizione, senza toccare questo switch.
    // data-pigment: in Opaco la pagina usa il pigmento del suo widget.
    const Detail = getWidget(view.widgetId)?.detailComponent;
    content = Detail ? (
      <div className="detail-scope" data-pigment={widgetPigment(view.widgetId)}>
        <Detail />
      </div>
    ) : (
      <Dashboard />
    );
  }

  return <AppShell>{content}</AppShell>;
}

function App() {
  return (
    <DatabaseGate>
      <SettingsProvider>
        <LayoutProvider>
          <BootGate>
            <WidgetProviders>
              <NavProvider>
                <CurrentView />
              </NavProvider>
            </WidgetProviders>
          </BootGate>
        </LayoutProvider>
      </SettingsProvider>
    </DatabaseGate>
  );
}

export default App;
