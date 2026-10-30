import PixyFace from "../../../core/pixy/PixyFace";
import { useSettings } from "../../../core/settings/useSettings";
import { useCompanion } from "../useCompanion";

interface CompanionFaceProps {
  /** Mostra il fumetto sopra la faccia. */
  showBubble?: boolean;
  bubbleSize?: "small" | "normal" | "large";
  /** Grandezza massima di un punto della faccia, in pixel CSS: limita quanto crescono gli occhi. */
  maxPointSize?: number;
  /** Margine intorno alla faccia, in punti: più piccolo nei riquadri piccoli (es. il mini dell'intestazione). */
  padding?: number;
  className?: string;
}

/**
 * Il Companion disegnato con il canvas comune di Pixy (core/pixy/PixyFace.tsx). Ce ne possono essere più di
 * uno contemporaneamente (widget + fantasma del drag + pagina): leggono tutti lo stesso fotogramma dal provider.
 */
function CompanionFace({ showBubble = true, bubbleSize = "normal", maxPointSize, padding, className = "" }: CompanionFaceProps) {
  const { sampleFrame, snapshot } = useCompanion();
  const { settings } = useSettings();
  return (
    <PixyFace
      sample={sampleFrame}
      color={settings.companionColor === "accent" ? "accent" : "face"}
      showMouth={settings.companionShowMouth}
      bubble={showBubble ? snapshot.bubble : null}
      bubbleSize={bubbleSize}
      maxPointSize={maxPointSize}
      padding={padding}
      // "companion-face": CompanionContext legge da qui i token per le notifiche con la faccia
      className={`companion-face ${className}`}
    />
  );
}

export default CompanionFace;
