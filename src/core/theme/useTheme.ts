import { useSettings } from "../settings/useSettings";
import { THEMES, type ThemeDef } from "./themes";

/** Il tema corrente (id, schema chiaro/scuro, glow...). Si aggiorna quando cambia l'impostazione. */
export function useTheme(): ThemeDef {
  const { settings } = useSettings();
  return THEMES[settings.theme];
}
