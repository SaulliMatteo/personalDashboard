import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S } from "../../core/widgets/sizes";
import ClockWidget from "./ClockWidget";
import ClockMini from "./mini/ClockMini";

export const clockWidget: WidgetDefinition = {
  id: "clock",
  name: "Orario",
  description: "L'ora corrente, grande e leggibile.",
  component: ClockWidget,
  sizes: [SIZE_S],
  mini: ClockMini,
};
