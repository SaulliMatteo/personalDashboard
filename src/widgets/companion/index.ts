import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_W, SIZE_M } from "../../core/widgets/sizes";
import CompanionWidget from "./CompanionWidget";
import CompanionDetail from "./CompanionDetail";
import CompanionMini from "./mini/CompanionMini";
import { CompanionProvider } from "./CompanionContext";
import { COMPANION_WIDGET_ID } from "./useCompanion";

export const companionWidget: WidgetDefinition = {
  id: COMPANION_WIDGET_ID,
  name: "Pixy",
  description: "Il tuo compagno a LED: cambia posa con studio, video, meteo, ora del giorno e l'app che stai usando.",
  component: CompanionWidget,
  sizes: [SIZE_S, SIZE_W, SIZE_M],
  defaultPlacement: { x: 2, y: 0, w: 1, h: 1 },
  detailComponent: CompanionDetail,
  mini: CompanionMini,
  settingsGroup: "companion",
  // Un solo cervello per tutte le copie disegnate (widget, fantasma del drag, pagina).
  provider: CompanionProvider,
};
