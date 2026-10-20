import { createElement } from "react";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { useThemeVariant } from "../../core/theme/variants";
import { COMPANION_CARDS } from "./card/cards";

/** Widget in dashboard: la card del tema corrente nella taglia scelta. */
function CompanionWidget({ w, h }: WidgetProps) {
  const Card = useThemeVariant(COMPANION_CARDS);
  return (
    // card-postit: in Quaderno la card è un post-it (vedi tokens.css).
    <WidgetFrame className="card-postit">
      {createElement(Card, { size: sizeKey(w, h) })}
    </WidgetFrame>
  );
}

export default CompanionWidget;
