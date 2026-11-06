import "./widgetCatalog.css";
import { useNav } from "../../../core/nav/useNav";
import { useCompact } from "../../../core/layout/useCompact";
import BackButton from "../../../ui/BackButton";
import CatalogGrid from "./CatalogGrid";

/** Pagina catalogo (dal "+" della dashboard): le stesse card di Impostazioni > Widget. */
function WidgetCatalog() {
  const { goToDashboard } = useNav();
  // sul telefono titolo e ← stanno nella barra in alto (AppShell)
  const compact = useCompact();

  return (
    <div className="widget-catalog">
      {!compact && (
        <header className="dashboard-header widget-catalog-header">
          <div>
            <h1>Widget disponibili</h1>
            <p>Aggiungi o rimuovi i widget dalla tua dashboard.</p>
          </div>
          <BackButton onClick={goToDashboard} />
        </header>
      )}

      {/* sul telefono, dopo "Aggiungi" si torna alla dashboard a vedere il widget */}
      <CatalogGrid onAdded={compact ? goToDashboard : undefined} />
    </div>
  );
}

export default WidgetCatalog;
