import { useNav } from "../../../core/nav/useNav";
import { WIDGET_REGISTRY } from "../../../widgets/registry";

/** Scheda Widget: l'elenco dei widget, con le scorciatoie alle loro impostazioni e pagine. */
function WidgetsTab() {
  const { openSettings, openWidgetDetail, goToCatalog } = useNav();

  return (
    <>
      <header className="sp-head">
        <h2>Widget</h2>
        <p>Ogni widget ha le sue impostazioni. Per aggiungerli o toglierli dalla dashboard usa il catalogo.</p>
      </header>

      <div className="settings-section">
        <div className="settings-fields">
          {WIDGET_REGISTRY.map((widget) => (
            <div key={widget.id} className="settings-field">
              <div className="settings-field-text">
                <span className="settings-field-label">{widget.name}</span>
                <p className="settings-field-description">{widget.description}</p>
              </div>
              <div className="settings-field-control">
                {widget.detailComponent && (
                  <button type="button" className="sp-btn sp-btn--ghost" onClick={() => openWidgetDetail(widget.id)}>
                    Apri
                  </button>
                )}
                {widget.settingsGroup && (
                  <button type="button" className="sp-btn" onClick={() => openSettings(`widget:${widget.id}`)}>
                    Impostazioni
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <button type="button" className="sp-btn" onClick={goToCatalog}>
          Apri il catalogo
        </button>
      </div>
    </>
  );
}

export default WidgetsTab;
