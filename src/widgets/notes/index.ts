import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_STRIP, SIZE_S, SIZE_M } from "../../core/widgets/sizes";
import NotesWidget from "./NotesWidget";
import NotesDetail from "./NotesDetail";
import NotesMini from "./mini/NotesMini";

export const notesWidget: WidgetDefinition = {
  id: "notes",
  name: "Quaderno",
  description: "Note organizzate in cartelle, con editor a pagine e scrittura a mano.",
  component: NotesWidget,
  sizes: [SIZE_STRIP, SIZE_S, SIZE_M],
  defaultPlacement: { x: 3, y: 1, w: 3, h: 1 },
  // La pagina si apre anche dalla barra laterale.
  detailComponent: NotesDetail,
  mini: NotesMini,
};
