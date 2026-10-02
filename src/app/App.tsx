import { SettingsProvider } from "../core/settings/SettingsContext";
import { LayoutProvider } from "../core/layout/LayoutContext";
import { NavProvider, useNav } from "../core/nav/NavContext";
import WidgetProviders from "../widgets/WidgetProviders";
import { getWidget } from "../widgets/registry";
import Dashboard from "../features/dashboard/Dashboard";
import WidgetCatalog from "../features/catalog/WidgetCatalog";
import DatabaseGate from "./DatabaseGate";
import AppShell from "./AppShell";

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
    const Detail = getWidget(view.widgetId)?.detailComponent;
    content = Detail ? <Detail /> : <Dashboard />;
  }

  return <AppShell>{content}</AppShell>;
}

function App() {
  return (
    <DatabaseGate>
      <SettingsProvider>
        <LayoutProvider>
          <WidgetProviders>
            <NavProvider>
              <CurrentView />
            </NavProvider>
          </WidgetProviders>
        </LayoutProvider>
      </SettingsProvider>
    </DatabaseGate>
  );
}

export default App;
