import { createElement } from "react";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { useThemeVariant } from "../../core/theme/variants";
import StudyCardNotte from "./card/StudyCardNotte";
import StudyCardOpaco from "./card/StudyCardOpaco";
import StudyCardQuaderno from "./card/StudyCardQuaderno";
import StudyCardFosforo from "./card/StudyCardFosforo";

// Ogni tema ha la sua card: nei mockup cambiano anche i pezzi, non solo i colori.
const CARDS = {
  notte: StudyCardNotte,
  opaco: StudyCardOpaco,
  quaderno: StudyCardQuaderno,
  fosforo: StudyCardFosforo,
};

function StudyWidget({ w, h }: WidgetProps) {
  const Card = useThemeVariant(CARDS);
  return (
    <WidgetFrame>
      {createElement(Card, { size: sizeKey(w, h) })}
    </WidgetFrame>
  );
}

export default StudyWidget;
