import Dashboard from "./pages/Dashboard";
import WidgetCatalog from "./pages/WidgetCatalog";
import "./css/App.css"
import "./css/theme.css"
import { SettingsProvider } from "./context/SettingContext";
import { LayoutProvider } from "./context/LayoutContext";
import { NavProvider, useNav } from "./context/NavContext";
import AppShell from "./components/layout/AppShell";

function CurrentView() {
  const { view } = useNav();
  return <AppShell>{view === "dashboard" ? <Dashboard /> : <WidgetCatalog />}</AppShell>;
}

function App() {
  // L'inizializzazione del DB (creazione tabella + eventuale migrazione
  // una tantum) ora vive dentro LayoutProvider, che è l'unico punto che
  // ne dipende davvero (deve completarsi PRIMA di leggere il layout
  // salvato). Tenerla in un solo posto evita due chiamate concorrenti a
  // initializeDatabase() partite da effect diversi.
  return (
    <SettingsProvider>
      <LayoutProvider>
        <NavProvider>
          <CurrentView />
        </NavProvider>
      </LayoutProvider>
    </SettingsProvider>
  );
}

export default App;
