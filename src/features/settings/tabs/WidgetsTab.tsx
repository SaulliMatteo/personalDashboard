import CatalogGrid from "../catalog/CatalogGrid";

/**
 * Scheda Widget: il catalogo. Da qui si aggiungono o tolgono i widget e, con la
 * rotellina della card, si aprono le loro impostazioni.
 */
function WidgetsTab({ openWidgetId = null }: { openWidgetId?: string | null }) {
  return (
    <>
      <header className="sp-head">
        <h2>Widget</h2>
        <p>Aggiungi o togli i widget dalla dashboard. La rotellina di ogni card apre le sue impostazioni.</p>
      </header>

      <CatalogGrid initialOpenId={openWidgetId} />
    </>
  );
}

export default WidgetsTab;
