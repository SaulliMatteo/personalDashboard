import Dashboard from "./pages/Dashboard";
import WidgetCatalog from "./pages/WidgetCatalog";
import "./css/App.css"
import "./css/theme.css"
import { SettingsProvider } from "./context/SettingContext";
import { LayoutProvider } from "./context/LayoutContext";
import { TimerProvider } from "./context/TimerContext";
import { NavProvider, useNav } from "./context/NavContext";
import AppShell from "./components/layout/AppShell";
import { WIDGET_MAP } from "./widgets/registry.tsx";

function CurrentView() {
  const { view } = useNav();

  let content;
  if (view.type === "dashboard") {
    content = <Dashboard />;
  } else if (view.type === "catalog") {
    content = <WidgetCatalog />;
  } else {
    // widgetDetail: qualunque widget futuro con una propria pagina si
    // aggancia qui semplicemente registrando detailComponent nel
    // registry, senza bisogno di toccare di nuovo questo switch.
    const widget = WIDGET_MAP[view.widgetId];
    content = widget?.detailComponent ? widget.detailComponent() : <Dashboard />;
  }

  return <AppShell>{content}</AppShell>;
}

function App() {
  // L'inizializzazione del DB (creazione tabelle + eventuale migrazione
  // una tantum) parte da LayoutProvider, ma anche TimerProvider la
  // richiama in autonomia prima di leggere le proprie tabelle (è
  // idempotente): React esegue gli effect dei figli prima di quelli dei
  // genitori, quindi non si può assumere che l'ordine nell'albero basti
  // a garantire che le tabelle esistano già.
  return (
    <SettingsProvider>
      <LayoutProvider>
        <TimerProvider>
          <NavProvider>
            <CurrentView />
          </NavProvider>
        </TimerProvider>
      </LayoutProvider>
    </SettingsProvider>
  );
}

export default App;
