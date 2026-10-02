import { SETTING_DEFS, type SettingsGroup } from "../schema";
import SettingsField from "./SettingsField";

/** Renderizza tutte le impostazioni di un gruppo, in automatico dallo schema. */
function SettingsSection({ group, className = "" }: { group: SettingsGroup; className?: string }) {
  return (
    <div className={`settings-fields ${className}`}>
      {SETTING_DEFS.filter((def) => def.group === group).map((def) => (
        <SettingsField key={def.key} def={def} />
      ))}
    </div>
  );
}

export default SettingsSection;
