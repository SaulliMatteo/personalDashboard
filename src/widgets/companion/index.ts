import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_M_WIDE, SIZE_M_SQUARE } from "../../core/widgets/sizes";
import CompanionWidget from "./CompanionWidget";
import CompanionDetail from "./CompanionDetail";
import { CompanionProvider, COMPANION_WIDGET_ID } from "./CompanionContext";

export const companionWidget: WidgetDefinition = {
  id: COMPANION_WIDGET_ID,
  name: "Companion",
  description: "Una faccina a LED che ti tiene compagnia: reagisce a studio, video e a quello che fai.",
  component: CompanionWidget,
  sizes: [SIZE_S, SIZE_M_WIDE, SIZE_M_SQUARE],
  detailComponent: CompanionDetail,
  settingsGroup: "companion",
  // Un solo cervello per tutte le copie disegnate (widget, fantasma del drag, pagina).
  provider: CompanionProvider,
};
