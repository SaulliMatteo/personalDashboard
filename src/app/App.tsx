import { SettingsProvider } from "../core/settings/SettingsContext";
import { LayoutProvider } from "../core/layout/LayoutContext";
import { MobileLayoutProvider } from "../core/layout/MobileLayoutContext";
import { useCompact } from "../core/layout/useCompact";
import { CloudProvider } from "../core/cloud/CloudContext";
import { NavProvider } from "../core/nav/NavContext";
import { useNav } from "../core/nav/useNav";
import WidgetProviders from "../widgets/WidgetProviders";
import SocialProviders from "../social/SocialProviders";
import { getWidget, WIDGET_REGISTRY, widgetPigment } from "../widgets/registry";
import Dashboard from "../features/dashboard/Dashboard";
import MobileDashboard from "../features/dashboard/MobileDashboard";
import WidgetCatalog from "../features/settings/catalog/WidgetCatalog";
import SettingsPage from "../features/settings/SettingsPage";
import RoomPage from "../social/room/RoomPage";
import DatabaseGate from "./DatabaseGate";
import AppShell, { type CompactBarSpec } from "./AppShell";
import BootGate from "./BootGate";

// i comandi che i widget mettono nella Stanza comune (social non può importare i widget)
const ROOM_CONTROLS = WIDGET_REGISTRY.flatMap((w) => (w.roomControls ? [{ id: w.id, Controls: w.roomControls }] : []));

function CurrentView() {
  const { view } = useNav();
  const compact = useCompact();
  // sul telefono ogni vista ha la sua barra in alto (la dashboard se la disegna da sé, con la matita)
  let bar: CompactBarSpec | undefined;
  const home = compact ? <MobileDashboard /> : <Dashboard />;

  let content;
  if (view.type === "dashboard") {
    content = home;
  } else if (view.type === "catalog") {
    bar = { lead: "back", title: "Widget", subtitle: "aggiungi alla dashboard" };
    content = <WidgetCatalog />;
  } else if (view.type === "settings") {
    bar = { lead: "back", title: "Impostazioni" };
    content = <SettingsPage section={view.section} />;
  } else if (view.type === "room") {
    bar = { lead: "menu", title: "Stanza comune" };
    // in Opaco la sala usa il pigmento del widget Gruppi
    content = (
      <RoomPage
        pigment={widgetPigment("groups")}
        controls={ROOM_CONTROLS.map(({ id, Controls }) => (
          <Controls key={id} />
        ))}
      />
    );
  } else {
    // Qualunque widget con una pagina propria si aggancia qui registrando
    // `detailComponent` nella sua definizione, senza toccare questo switch.
    // data-pigment: in Opaco la pagina usa il pigmento del suo widget.
    const widget = getWidget(view.widgetId);
    const Detail = widget?.detailComponent;
    if (Detail) bar = { lead: "back", title: widget.name };
    content = Detail ? (
      <div className="detail-scope" data-pigment={widgetPigment(view.widgetId)}>
        <Detail />
      </div>
    ) : (
      home
    );
  }

  // la Stanza comune sta tutta nella finestra: lì .main non scorre
  return (
    <AppShell scroll={view.type !== "room"} compactBar={compact ? bar : undefined}>
      {content}
    </AppShell>
  );
}

function App() {
  return (
    <DatabaseGate>
      <SettingsProvider>
        <LayoutProvider>
          {/* Layout del telefono, separato da quello del desktop (si carica solo nella finestra compatta). */}
          <MobileLayoutProvider>
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
          </MobileLayoutProvider>
        </LayoutProvider>
      </SettingsProvider>
    </DatabaseGate>
  );
}

export default App;
