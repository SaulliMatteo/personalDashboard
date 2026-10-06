import { SETTING_DEFS, type SettingsGroup } from "../schema";
import SettingsField from "./SettingsField";

/**
 * Renderizza tutte le impostazioni di un gruppo, in automatico dallo
 * schema, raggruppate per `section` (nell'ordine in cui compaiono).
 */
function SettingsSection({ group, className = "" }: { group: SettingsGroup; className?: string }) {
  const defs = SETTING_DEFS.filter((def) => def.group === group);
  const sections = [...new Set(defs.map((def) => def.section))];

  return (
    <div className={`settings-sections ${className}`}>
      {sections.map((section) => (
        <div key={section} className="settings-section">
          <h4 className="settings-section-title">{section}</h4>
          <div className="settings-fields">
            {defs
              .filter((def) => def.section === section)
              .map((def) => (
                <SettingsField key={def.key} def={def} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default SettingsSection;
