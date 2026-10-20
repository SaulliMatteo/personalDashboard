import { createElement } from "react";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { useThemeVariant } from "../../core/theme/variants";
import { STUDY_CARDS } from "./card/cards";

function StudyWidget({ w, h }: WidgetProps) {
  const Card = useThemeVariant(STUDY_CARDS);
  return (
    <WidgetFrame>
      {createElement(Card, { size: sizeKey(w, h) })}
    </WidgetFrame>
  );
}

export default StudyWidget;
