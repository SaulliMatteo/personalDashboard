import { useLayout } from "../../../core/layout/LayoutContext";
import { useNav } from "../../../core/nav/NavContext";
import ConfirmButton from "../../../ui/ConfirmButton";

interface WidgetsTabProps {
  /** Chiude il modale Settings quando si passa al catalogo widget (pagina separata). */
  onClose: () => void;
}

/**
 * Le impostazioni dei singoli widget non stanno più qui: si aprono dalla
 * rotellina sulla card del widget, nel catalogo (features/catalog).
 */
function WidgetsTab({ onClose }: WidgetsTabProps) {
  const { resetLayout } = useLayout();
  const { goToCatalog } = useNav();

  return (
    <div className="settings-options">
      <div className="settings-option">
        <span>Reset posizione widget (rimuove anche quelli aggiunti dal catalogo)</span>
        <ConfirmButton className="settings-btn" label="Reset" onConfirm={resetLayout} />
      </div>

      <div className="settings-option">
        <span>Aggiungi o rimuovi widget dalla dashboard e modificane le impostazioni</span>
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
  );
}

export default WidgetsTab;
