import { createElement } from "react";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { useThemeVariant } from "../../core/theme/variants";
import { CompanionCardFosforo, CompanionCardNotte, CompanionCardOpaco, CompanionCardQuaderno } from "./card/CompanionCards";

const CARDS = {
  notte: CompanionCardNotte,
  opaco: CompanionCardOpaco,
  quaderno: CompanionCardQuaderno,
  fosforo: CompanionCardFosforo,
};

/** Widget in dashboard: la card del tema corrente nella taglia scelta. */
function CompanionWidget({ w, h }: WidgetProps) {
  const Card = useThemeVariant(CARDS);
  return (
    // card-postit: in Quaderno la card è un post-it (vedi tokens.css).
    <WidgetFrame className="card-postit">
      {createElement(Card, { size: sizeKey(w, h) })}
    </WidgetFrame>
  );
}

export default CompanionWidget;
