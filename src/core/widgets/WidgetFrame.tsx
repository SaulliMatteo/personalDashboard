import BorderGlow, { type BorderGlowProps } from "../../ui/BorderGlow";
import { useSettings } from "../settings/SettingsContext";

// Unico punto in cui vivono i parametri di default del glow dei widget.
const GLOW_DEFAULTS: BorderGlowProps = {
  edgeSensitivity: 24,
  glowColor: "40 80 80",
  borderRadius: 14,
  coneSpread: 25,
  colors: ["#c084fc", "#f472b6", "#38bdf8"],
};

/**
 * Cornice comune di tutti i widget. Legge le impostazioni (glow, tema,
 * animazioni) e le passa a BorderGlow; un widget può comunque
 * sovrascrivere qualunque prop: <WidgetFrame colors={[...]}>.
 */
function WidgetFrame({ children, ...overrides }: BorderGlowProps) {
  const { settings } = useSettings();

  return (
    <BorderGlow
      {...GLOW_DEFAULTS}
      backgroundColor={settings.theme === "light" ? "#ffffff" : "#000000"}
      enabled={settings.glowEnabled}
      glowIntensity={settings.glowIntensity}
      glowRadius={settings.glowRadius}
      animated={settings.glowEnabled && settings.animationsEnabled}
      {...overrides}
    >
      {children}
    </BorderGlow>
  );
}

export default WidgetFrame;
