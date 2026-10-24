import { createElement } from "react";
import { useThemeVariant } from "../../core/theme/variants";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { NOTES_CARDS } from "./card/cards";

/** Widget in dashboard: la card del tema (card/cards.ts) nella taglia della cella. */
function NotesWidget({ w, h }: WidgetProps) {
  const Card = useThemeVariant(NOTES_CARDS);
  return createElement(Card, { size: sizeKey(w, h) });
}

export default NotesWidget;
