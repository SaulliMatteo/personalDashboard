import { MdSettings } from "react-icons/md";
import { useNav } from "../../core/nav/useNav";
import type { WidgetDefinition } from "../../core/widgets/types";
import "./widgetSettings.css";

/**
 * Rotellina in alto a destra della card del catalogo: porta alle
 * impostazioni del widget nella pagina Impostazioni. Non compare per i
 * widget senza impostazioni (`settingsGroup`).
 */
function WidgetSettingsButton({ widget }: { widget: WidgetDefinition }) {
  const { openSettings } = useNav();
  if (!widget.settingsGroup) return null;

  return (
    <button
      type="button"
      className="widget-settings-gear"
      onClick={() => openSettings(`widget:${widget.id}`)}
      aria-label={`Impostazioni ${widget.name}`}
      title="Impostazioni del widget"
    >
      <MdSettings />
    </button>
  );
}

export default WidgetSettingsButton;
