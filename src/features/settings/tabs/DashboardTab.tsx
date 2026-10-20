import { useLayout } from "../../../core/layout/LayoutContext";
import { useNav } from "../../../core/nav/NavContext";
import SettingsSection from "../../../core/settings/components/SettingsSection";
import ConfirmButton from "../../../ui/ConfirmButton";

/** Scheda Dashboard: intestazione, griglia, trascinamento e gestione del layout. */
function DashboardTab() {
  const { resetLayout } = useLayout();
  const { goToCatalog } = useNav();

  return (
    <>
      <header className="sp-head">
        <h2>Dashboard</h2>
        <p>Come si presenta la pagina principale e come si spostano i widget.</p>
      </header>

      <SettingsSection group="dashboard" />

      <div className="settings-section">
        <h4 className="settings-section-title">Widget in dashboard</h4>
        <div className="settings-fields">
          <div className="settings-field">
            <div className="settings-field-text">
              <span className="settings-field-label">Aggiungi o togli widget</span>
              <p className="settings-field-description">Apre il catalogo con tutti i widget disponibili.</p>
            </div>
            <div className="settings-field-control">
              <button type="button" className="sp-btn" onClick={goToCatalog}>
                Apri il catalogo
              </button>
            </div>
          </div>
          <div className="settings-field">
            <div className="settings-field-text">
              <span className="settings-field-label">Ripristina il layout</span>
              <p className="settings-field-description">Rimette i widget nelle posizioni iniziali e toglie quelli aggiunti dal catalogo.</p>
            </div>
            <div className="settings-field-control">
              <ConfirmButton className="sp-btn sp-btn--danger" label="Ripristina" onConfirm={resetLayout} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default DashboardTab;
