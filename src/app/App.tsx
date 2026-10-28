import { SettingsProvider } from "../core/settings/SettingsContext";
import { LayoutProvider } from "../core/layout/LayoutContext";
import { CloudProvider } from "../core/cloud/CloudContext";
import { NavProvider } from "../core/nav/NavContext";
import { useNav } from "../core/nav/useNav";
import WidgetProviders from "../widgets/WidgetProviders";
import SocialProviders from "../social/SocialProviders";
import { getWidget, widgetPigment } from "../widgets/registry";
import Dashboard from "../features/dashboard/Dashboard";
import WidgetCatalog from "../features/settings/catalog/WidgetCatalog";
import SettingsPage from "../features/settings/SettingsPage";
import RoomPage from "../social/room/RoomPage";
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
  } else if (view.type === "settings") {
    content = <SettingsPage section={view.section} />;
  } else if (view.type === "room") {
    // in Opaco la sala usa il pigmento del widget Gruppi
    content = <RoomPage pigment={widgetPigment("groups")} />;
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

  // la Stanza comune sta tutta nella finestra: lì .main non scorre
  return <AppShell scroll={view.type !== "room"}>{content}</AppShell>;
}

function App() {
  return (
    <DatabaseGate>
      <SettingsProvider>
        <LayoutProvider>
          <BootGate>
            {/* Account dei Gruppi: senza configurazione o offline resta inerte (app solo locale). */}
            <CloudProvider>
              {/* Moduli dei Gruppi (es. invio dei totali di studio): lavorano solo con l'account pronto. */}
              <SocialProviders>
                <WidgetProviders>
                  <NavProvider>
                    <CurrentView />
                  </NavProvider>
                </WidgetProviders>
              </SocialProviders>
            </CloudProvider>
          </BootGate>
        </LayoutProvider>
      </SettingsProvider>
    </DatabaseGate>
  );
}

export default App;
