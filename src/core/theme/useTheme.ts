import { useSettings } from "../settings/useSettings";
import { accentFor } from "../settings/schema";
import { THEMES, resolveMode, type ThemeId, type ThemeMode, type ThemeModeDef } from "./themes";
import { useSystemDark } from "./useSystemDark";

/** Il tema corrente con la variante già risolta ("auto" diventa giorno o notte). */
export interface ResolvedTheme extends ThemeModeDef {
  id: ThemeId;
  label: string;
  mode: ThemeMode;
  /** Accent effettivo: quello scelto dall'utente per questa variante, altrimenti `defaultAccent`. */
  accent: string;
}

/** Il tema corrente (id, variante, schema chiaro/scuro, glow, accent...). Si aggiorna quando cambia l'impostazione o il sistema. */
export function useTheme(): ResolvedTheme {
  const { settings } = useSettings();
  const mode = resolveMode(settings.themeMode, useSystemDark());
  const def = THEMES[settings.theme];
  const modeDef = def.modes[mode];
  return { id: def.id, label: def.label, mode, ...modeDef, accent: accentFor(settings, mode) ?? modeDef.defaultAccent };
}
