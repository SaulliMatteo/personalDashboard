import { useLayout } from "../../../core/layout/LayoutContext";
import { useNav } from "../../../core/nav/NavContext";
import SettingsSection from "../../../core/settings/components/SettingsSection";
import { SETTING_DEFS, type SettingDef, type SettingKey } from "../../../core/settings/schema";
import { WIDGET_REGISTRY } from "../../../widgets/registry";
import ConfirmButton from "../../../ui/ConfirmButton";

const SLOT_KEYS: SettingKey[] = ["headerSlot1", "headerSlot2"];

/** I widget che hanno una versione mini, nell'ordine del registry. */
const MINI_OPTIONS = WIDGET_REGISTRY.filter((widget) => widget.mini).map((widget) => ({ value: widget.id, label: widget.name }));

/**
 * Gli spazi dell'intestazione sono testo nello schema (core non conosce i widget):
 * qui diventano select con le opzioni prese dal registry, al loro posto nella sezione.
 */
const SLOT_DEFS: SettingDef[] = SETTING_DEFS.filter((def) => SLOT_KEYS.includes(def.key)).map((def) => ({
  ...def,
  type: "select",
  options: [
    ...(def.key === "headerSlot1" ? [{ value: "auto", label: "Come il tema" }] : []),
    { value: "none", label: "Niente" },
    ...MINI_OPTIONS,
  ],
}));

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

      <SettingsSection group="dashboard" overrides={SLOT_DEFS} />

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
