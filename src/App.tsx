import { useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import { initializeDatabase } from "./database/db";
import "./css/App.css"
import "./css/theme.css"
import { SettingsProvider } from "./context/SettingContext";

function App() {
  useEffect(() => {
    initializeDatabase()
      .then(() => {
        console.log("SQLite inizializzato correttamente");
      })
      .catch((error) => {
        console.error("ERRORE SQLITE:", error);
      });
  }, []);

  return (
    <SettingsProvider>
      <Dashboard />
    </SettingsProvider>
  );
}

export default App;