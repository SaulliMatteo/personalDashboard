import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_M_SQUARE, SIZE_L_WIDE, SIZE_L_TALL } from "../../core/widgets/sizes";
import CalendarWidget from "./CalendarWidget";

export const calendarWidget: WidgetDefinition = {
  id: "calendar",
  name: "Calendario",
  description: "I prossimi eventi in agenda per oggi.",
  component: CalendarWidget,
  sizes: [SIZE_M_SQUARE, SIZE_L_WIDE, SIZE_L_TALL],
  defaultPlacement: { x: 2, y: 0, w: 2, h: 2 },
};
