import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { useSettings } from "../../core/settings/SettingsContext";
import { useCompanion } from "./CompanionContext";
import CompanionFace from "./components/CompanionFace";
import { BEHAVIOR_LABELS } from "./engine/brain";
import "./CompanionWidget.css";

/** Widget in dashboard: la faccia occupa tutta la card; nelle taglie grandi nome e stato in basso. */
function CompanionWidget({ w, h }: WidgetProps) {
  const { snapshot } = useCompanion();
  const { settings } = useSettings();
  const isSmall = w < 2 && h < 2;
  const showFooter = h >= 2;

  return (
    <WidgetFrame>
      <article className={`widget companion-widget${isSmall ? " companion-widget--small" : ""}`}>
        <CompanionFace className="companion-widget-face" bubbleSize={isSmall ? "small" : "normal"} padding={isSmall ? 1 : 2} />
        {showFooter && (
          <footer className="companion-widget-footer">
            <span className="companion-widget-name">{settings.companionName || "Companion"}</span>
            <span className="companion-widget-status">{BEHAVIOR_LABELS[snapshot.behavior]}</span>
          </footer>
        )}
      </article>
    </WidgetFrame>
  );
}

export default CompanionWidget;
