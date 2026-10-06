import BorderGlow, { type BorderGlowProps } from "../../ui/BorderGlow";
import { useSettings } from "../settings/SettingsContext";
import { GLOW_PALETTES } from "../settings/schema";
import { resolveTheme, useSystemPrefersLight } from "../settings/theme";

/**
 * Cornice comune di tutti i widget. Legge le impostazioni (glow, tema,
 * raggio, animazioni) e le passa a BorderGlow; un widget può comunque
 * sovrascrivere qualunque prop: <WidgetFrame colors={[...]}>.
 */
function WidgetFrame({ children, ...overrides }: BorderGlowProps) {
  const { settings } = useSettings();
  const systemPrefersLight = useSystemPrefersLight();
  const isLight = resolveTheme(settings.theme, systemPrefersLight) === "light";

  const colors =
    settings.glowPalette === "accent"
      ? [settings.accentColor]
      : [...GLOW_PALETTES[settings.glowPalette].colors];

  return (
    <BorderGlow
      backgroundColor={isLight ? "#ffffff" : "#000000"}
      borderRadius={settings.cardRadius}
      colors={colors}
      enabled={settings.glowEnabled}
      glowColor={`${settings.glowHue} 80 80`}
      glowIntensity={settings.glowIntensity}
      glowRadius={settings.glowRadius}
      edgeSensitivity={settings.glowEdgeSensitivity}
      coneSpread={settings.glowConeSpread}
      fillOpacity={settings.glowFillOpacity}
      animated={settings.glowEnabled && settings.animationsEnabled && settings.glowSweepOnLoad}
      {...overrides}
    >
      {children}
    </BorderGlow>
  );
}

export default WidgetFrame;
