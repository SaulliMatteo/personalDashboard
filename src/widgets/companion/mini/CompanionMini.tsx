import { useEffect } from "react";
import { useSettings } from "../../../core/settings/useSettings";
import { useCompanion } from "../useCompanion";
import CompanionFace from "../components/CompanionFace";
import { BEHAVIOR_LABELS } from "../engine/brain";
import "./CompanionMini.css";

/** Mini da intestazione: la faccia piccola, nome e cosa sta facendo. */
function CompanionMini() {
  const { snapshot, retain } = useCompanion();
  const { settings } = useSettings();
  // Tiene vivo il Companion anche se non è in dashboard, finché il mini è visibile.
  useEffect(() => retain(), [retain]);

  return (
    <div className="companion-mini">
      <CompanionFace className="companion-mini-face" showBubble={false} maxPointSize={5} padding={2} />
      <span className="companion-mini-text">
        <span className="companion-mini-name">{settings.companionName || "Companion"}</span>
        <span>{BEHAVIOR_LABELS[snapshot.behavior]}</span>
      </span>
    </div>
  );
}

export default CompanionMini;
