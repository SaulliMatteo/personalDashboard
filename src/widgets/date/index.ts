import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S } from "../../core/widgets/sizes";
import DateWidget from "./DateWidget";
import DateMini from "./mini/DateMini";

export const dateWidget: WidgetDefinition = {
  id: "date",
  name: "Giorno",
  description: "Il giorno di oggi: numero, mese e giorno della settimana.",
  component: DateWidget,
  sizes: [SIZE_S],
  mini: DateMini,
};
