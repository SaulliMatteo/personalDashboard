import { useLayout } from "../../../core/layout/useLayout";
import SettingsSection from "../../../core/settings/components/SettingsSection";
import { HEADER_SLOT_AUTO, SETTING_DEFS, type SettingDef } from "../../../core/settings/schema";
import { useSettings } from "../../../core/settings/useSettings";
import { useThemeVariant } from "../../../core/theme/variants";
import { WIDGET_REGISTRY } from "../../../widgets/registry";
import ConfirmButton from "../../../ui/ConfirmButton";
import ExpandableText from "../../../ui/ExpandableText";

/** I widget che hanno una versione mini, nell'ordine del registry. */
const MINI_OPTIONS = WIDGET_REGISTRY.filter((widget) => widget.mini).map((widget) => ({ value: widget.id, label: widget.name }));

const slotDef = (key: "headerSlot1" | "headerSlot2") => SETTING_DEFS.find((def) => def.key === key);

/**
 * Gli spazi dell'intestazione sono testo nello schema (core non conosce i widget):
 * qui diventano select con le opzioni prese dal registry, al loro posto nella sezione.
 * Ogni spazio non offre il widget già scelto nell'altro ("Come il tema" vale il mini del
 * tema corrente); il valore attuale resta sempre tra le opzioni.
 */
function useSlotDefs(): SettingDef[] {
  const { settings } = useSettings();
  const auto = useThemeVariant(HEADER_SLOT_AUTO);
  const first = settings.headerSlot1 === "auto" ? auto : settings.headerSlot1;
  const second = settings.headerSlot2;

  const minis = (taken: string, current: string) =>
    MINI_OPTIONS.filter((option) => option.value === current || option.value !== taken);

  const defs: SettingDef[] = [];
  const def1 = slotDef("headerSlot1");
  const def2 = slotDef("headerSlot2");
  if (def1) {
    defs.push({
      ...def1,
      type: "select",
      options: [
        // "Come il tema" sparisce se il mini del tema è già nel secondo spazio (salvo sia quello scelto).
        ...(settings.headerSlot1 === "auto" || auto === "none" || auto !== second ? [{ value: "auto", label: "Come il tema" }] : []),
        { value: "none", label: "Niente" },
        ...minis(second, settings.headerSlot1),
      ],
    });
  }
  if (def2) {
    defs.push({ ...def2, type: "select", options: [{ value: "none", label: "Niente" }, ...minis(first, settings.headerSlot2)] });
  }
  return defs;
}

/** Scheda Dashboard: intestazione, griglia, trascinamento e gestione del layout. */
function DashboardTab() {
  const { resetLayout } = useLayout();
  const slotDefs = useSlotDefs();

  return (
    <>
      <header className="sp-head">
        <h2>Dashboard</h2>
        <p>Come si presenta la pagina principale e come si spostano i widget.</p>
      </header>

      <SettingsSection group="dashboard" overrides={slotDefs} />

      <div className="settings-section">
        <h4 className="settings-section-title">Widget in dashboard</h4>
        <div className="settings-fields">
          <div className="settings-field">
            <div className="settings-field-text">
              <span className="settings-field-label">Ripristina il layout</span>
              <ExpandableText className="settings-field-description">Rimette i widget nelle posizioni iniziali e toglie quelli aggiunti dal catalogo.</ExpandableText>
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
