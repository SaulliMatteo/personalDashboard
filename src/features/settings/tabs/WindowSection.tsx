import { useEffect, useId, useState } from "react";
import type { SettingDef } from "../../../core/settings/schema";
import SettingsField from "../../../core/settings/components/SettingsField";
import { APP_TRAY_AVAILABLE, getLaunchAtStartup, setLaunchAtStartup } from "../../../core/system/appWindowApi";
import { isMac } from "../../../core/system/platform";
import ExpandableText from "../../../ui/ExpandableText";

/** La X che nasconde la finestra (src-tauri/src/app_tray.rs): qui e non in SETTING_DEFS, solo nell'app desktop. */
const CLOSE_TO_TRAY_DEF: SettingDef = {
  key: "closeToTray",
  group: "general",
  section: "Finestra e avvio",
  type: "boolean",
  label: isMac() ? "Chiudendo la finestra resta nella barra dei menu" : "Chiudendo la finestra resta vicino all'orologio",
  description:
    "La dashboard continua a contare il tempo al PC, a ricevere i file e le notifiche. Per chiuderla davvero usa Esci nel menu dell'icona. Spento: la X chiude l'app.",
};

/**
 * Impostazioni > Generale: chiusura nella barra delle notifiche e avvio col computer. L'avvio non è un'impostazione
 * salvata nel DB: lo stato vero lo tiene il sistema (chiave Run su Windows, LaunchAgent su macOS) e si rilegge qui.
 */
function WindowSection() {
  const startupId = useId();
  const [startup, setStartup] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!APP_TRAY_AVAILABLE) return;
    let cancelled = false;
    getLaunchAtStartup()
      .then((on) => !cancelled && setStartup(on))
      .catch(() => !cancelled && setStartup(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!APP_TRAY_AVAILABLE) return null;

  async function toggleStartup(enabled: boolean) {
    setError(null);
    try {
      setStartup(await setLaunchAtStartup(enabled));
    } catch {
      setError("Non sono riuscito a cambiare l'avvio col computer.");
    }
  }

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">Finestra e avvio</h4>
      <div className="settings-fields">
        <SettingsField def={CLOSE_TO_TRAY_DEF} />
        <div className={`settings-field settings-field--boolean${startup === null ? " is-disabled" : ""}`}>
          <div className="settings-field-text">
            <label htmlFor={startupId} className="settings-field-label">
              Avvia con il computer
            </label>
            <ExpandableText id={`${startupId}-desc`} className="settings-field-description">
              {isMac()
                ? "All'accesso la dashboard parte nascosta nella barra dei menu e comincia a contare."
                : "All'accesso a Windows la dashboard parte nascosta vicino all'orologio e comincia a contare."}
            </ExpandableText>
          </div>
          <div className="settings-field-control">
            <input
              id={startupId}
              type="checkbox"
              role="switch"
              className="settings-switch"
              aria-describedby={`${startupId}-desc`}
              disabled={startup === null}
              checked={startup === true}
              onChange={(e) => void toggleStartup(e.target.checked)}
            />
          </div>
        </div>
      </div>
      {error && <p className="settings-field-description">{error}</p>}
    </div>
  );
}

export default WindowSection;
