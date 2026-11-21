import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_M, SIZE_S, SIZE_W } from "../../core/widgets/sizes";
import CalendarWidget from "./CalendarWidget";
import CalendarDetail from "./CalendarDetail";
import CalendarMini from "./mini/CalendarMini";
import CalendarWatchProvider from "./CalendarWatchProvider";

export const calendarWidget: WidgetDefinition = {
  id: "calendar",
  name: "Calendario",
  description: "Eventi, sessioni di studio pianificate e note collegate, per mese, settimana e giorno.",
  component: CalendarWidget,
  // la prima è quella proposta dal catalogo
  sizes: [SIZE_M, SIZE_S, SIZE_W],
  detailComponent: CalendarDetail,
  mini: CalendarMini,
  // promemoria e Companion anche col widget fuori dalla dashboard
  provider: CalendarWatchProvider,
};
