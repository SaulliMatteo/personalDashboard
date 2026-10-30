import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_W } from "../../core/widgets/sizes";
import WhiteboardWidget from "./WhiteboardWidget";
import WhiteboardDetail from "./WhiteboardDetail";

export const whiteboardWidget: WidgetDefinition = {
  id: "whiteboard",
  name: "Lavagna",
  description: "Disegni e schemi veloci con Excalidraw. Non viene salvata.",
  component: WhiteboardWidget,
  sizes: [SIZE_S, SIZE_W],
  detailComponent: WhiteboardDetail,
};
