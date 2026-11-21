import { useNav } from "../../../core/nav/useNav";
import { requestWidgetIntent } from "../../../core/nav/intents";

export type View = "month" | "week" | "day";

/** Apre il Calendario: in una vista, o con l'evento rapido per un elemento nuovo. */
export function useOpenCalendar() {
  const { openWidgetDetail } = useNav();
  return {
    openView: (view: View) => {
      requestWidgetIntent("calendar", { type: "openView", view });
      openWidgetDetail("calendar");
    },
    openNew: () => {
      requestWidgetIntent("calendar", { type: "new" });
      openWidgetDetail("calendar");
    },
  };
}

