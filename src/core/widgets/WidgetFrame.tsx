import BorderGlow, { type BorderGlowProps } from "../../ui/BorderGlow";
import { useSettings } from "../settings/useSettings";
import { GLOW_PALETTES } from "../settings/schema";
import { useTheme } from "../theme/useTheme";

/**
 * Cornice comune di tutti i widget. Sfondo, bordo e raggio vengono dai token
 * del tema; il glow si accende solo nei temi che lo prevedono (Notte) e se
 * l'utente non l'ha spento. Un widget può comunque sovrascrivere qualunque
 * prop: <WidgetFrame colors={[...]}>.
 */
function WidgetFrame({ children, ...overrides }: BorderGlowProps) {
  const { settings } = useSettings();
  const theme = useTheme();
  const glow = theme.glow && settings.glowEnabled;

  const colors =
    settings.glowPalette === "accent"
      ? [settings.accentOverride ? settings.accentColor : theme.defaultAccent]
      : [...GLOW_PALETTES[settings.glowPalette].colors];

  return (
    <BorderGlow
      colors={colors}
      enabled={glow}
      glowColor={`${settings.glowHue} 80 80`}
      glowIntensity={settings.glowIntensity}
      glowRadius={settings.glowRadius}
      edgeSensitivity={settings.glowEdgeSensitivity}
      coneSpread={settings.glowConeSpread}
      fillOpacity={settings.glowFillOpacity}
      animated={glow && settings.animationsEnabled && settings.glowSweepOnLoad}
      {...overrides}
    >
      {children}
    </BorderGlow>
  );
}

export default WidgetFrame;
