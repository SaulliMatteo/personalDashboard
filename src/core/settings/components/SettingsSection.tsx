import { SETTING_DEFS, type SettingDef, type SettingKey, type SettingsGroup } from "../schema";
import SettingsField from "./SettingsField";

/**
 * Renderizza tutte le impostazioni di un gruppo, in automatico dallo
 * schema, raggruppate per `section` (nell'ordine in cui compaiono).
 * `omit` toglie le chiavi che la pagina mostra con un controllo suo;
 * `overrides` sostituisce una definizione al suo posto (es. opzioni prese dal registry).
 */
function SettingsSection({
  group,
  omit = [],
  overrides = [],
  className = "",
}: {
  group: SettingsGroup;
  omit?: SettingKey[];
  overrides?: SettingDef[];
  className?: string;
}) {
  const defs = SETTING_DEFS.filter((def) => def.group === group && !omit.includes(def.key)).map(
    (def) => overrides.find((o) => o.key === def.key) ?? def
  );
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
