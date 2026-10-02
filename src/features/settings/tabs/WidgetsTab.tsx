import { useLayout } from "../../../core/layout/LayoutContext";
import { useNav } from "../../../core/nav/NavContext";
import SettingsSection from "../../../core/settings/components/SettingsSection";
import ConfirmButton from "../../../ui/ConfirmButton";
import { WIDGET_REGISTRY } from "../../../widgets/registry";

interface WidgetsTabProps {
  /** Chiude il modale Settings quando si passa al catalogo widget (pagina separata). */
  onClose: () => void;
}

function WidgetsTab({ onClose }: WidgetsTabProps) {
  const { resetLayout } = useLayout();
  const { goToCatalog } = useNav();

  // Ogni widget con `settingsGroup` nel registry compare qui da solo.
  const configurable = WIDGET_REGISTRY.filter((widget) => widget.settingsGroup);

  return (
    <>
      <div className="settings-options">
        <div className="settings-option">
          <span>Reset posizione widget (rimuove anche quelli aggiunti dal catalogo)</span>
          <ConfirmButton className="settings-btn" label="Reset" onConfirm={resetLayout} />
        </div>

        <div className="settings-option">
          <span>Aggiungi o rimuovi widget dalla dashboard</span>
          <button
            type="button"
            className="settings-btn"
            onClick={() => {
              onClose();
              goToCatalog();
            }}
          >
            Gestisci widget
          </button>
        </div>
      </div>

      {configurable.map((widget) =>
        widget.settingsGroup ? (
          <div key={widget.id} className="settings-widget-block">
            <h3 className="settings-widget-title">{widget.name}</h3>
            <SettingsSection group={widget.settingsGroup} />
          </div>
        ) : null
      )}
    </>
  );
}

export default WidgetsTab;
