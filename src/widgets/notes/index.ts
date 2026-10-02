import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_M_SQUARE, SIZE_L_WIDE } from "../../core/widgets/sizes";
import NotesWidget from "./NotesWidget";

export const notesWidget: WidgetDefinition = {
  id: "notes",
  name: "Note",
  description: "Appunti veloci sempre a portata di mano.",
  component: NotesWidget,
  sizes: [SIZE_M_SQUARE, SIZE_L_WIDE],
  defaultPlacement: { x: 0, y: 1, w: 2, h: 2 },
};
