import { MdSettings } from "react-icons/md";
import type { WidgetDefinition } from "../../../core/widgets/types";
import "./widgetSettings.css";

/**
 * Rotellina in alto a destra della card del catalogo: apre e chiude le
 * impostazioni del widget dentro la card. Non compare per i widget senza
 * impostazioni (`settingsGroup`).
 */
function WidgetSettingsButton({ widget, open, onToggle }: { widget: WidgetDefinition; open: boolean; onToggle: () => void }) {
  if (!widget.settingsGroup) return null;

  return (
    <button
      type="button"
      className={`widget-settings-gear${open ? " is-open" : ""}`}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`Impostazioni ${widget.name}`}
      title={open ? "Chiudi le impostazioni" : "Impostazioni del widget"}
    >
      <MdSettings />
    </button>
  );
}

export default WidgetSettingsButton;
