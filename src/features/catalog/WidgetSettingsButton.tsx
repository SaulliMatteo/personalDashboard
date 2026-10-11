import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdSettings } from "react-icons/md";
import SettingsSection from "../../core/settings/components/SettingsSection";
import type { WidgetDefinition } from "../../core/widgets/types";
import "./widgetSettings.css";

/**
 * Rotellina in alto a destra della card del catalogo: apre una finestra
 * con le impostazioni del singolo widget (il suo `settingsGroup` nello
 * schema). Non compare per i widget senza impostazioni.
 */
function WidgetSettingsButton({ widget }: { widget: WidgetDefinition }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!widget.settingsGroup) return null;

  return (
    <>
      <button
        type="button"
        className="widget-settings-gear"
        onClick={() => setOpen(true)}
        aria-label={`Impostazioni ${widget.name}`}
        title="Impostazioni del widget"
      >
        <MdSettings />
      </button>

      {open &&
        createPortal(
          <div className="widget-settings-overlay" onClick={() => setOpen(false)}>
            <div
              className="widget-settings-dialog"
              role="dialog"
              aria-label={`Impostazioni ${widget.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="widget-settings-header">
                <h3>{widget.name}</h3>
                <button type="button" className="widget-settings-close" onClick={() => setOpen(false)} aria-label="Chiudi">
                  <MdClose />
                </button>
              </div>
              <div className="widget-settings-body">
                <SettingsSection group={widget.settingsGroup} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default WidgetSettingsButton;
