import { createElement } from "react";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import { sizeKey } from "../../core/widgets/sizes";
import { useThemeVariant } from "../../core/theme/variants";
import { CALENDAR_CARDS } from "./card/cards";

/** Calendario in dashboard: la card del tema nella taglia della cella (1×1, 2×1, 2×2). */
function CalendarWidget({ w, h }: { w: number; h: number }) {
  const Card = useThemeVariant(CALENDAR_CARDS);
  return <WidgetFrame>{createElement(Card, { size: sizeKey(w, h) })}</WidgetFrame>;
}

export default CalendarWidget;
