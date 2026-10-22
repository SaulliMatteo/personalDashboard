import "./widgetCatalog.css";
import { useNav } from "../../../core/nav/useNav";
import BackButton from "../../../ui/BackButton";
import CatalogGrid from "./CatalogGrid";

/** Pagina catalogo (dal "+" della dashboard): le stesse card di Impostazioni > Widget. */
function WidgetCatalog() {
  const { goToDashboard } = useNav();

  return (
    <div className="widget-catalog">
      <header className="dashboard-header widget-catalog-header">
        <div>
          <h1>Widget disponibili</h1>
          <p>Aggiungi o rimuovi i widget dalla tua dashboard.</p>
        </div>
        <BackButton onClick={goToDashboard} />
      </header>

      <CatalogGrid />
    </div>
  );
}

export default WidgetCatalog;
