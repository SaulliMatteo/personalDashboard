import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_M_SQUARE } from "../../core/widgets/sizes";
import NotesWidget from "./NotesWidget";
import NotesDetail from "./NotesDetail";

export const notesWidget: WidgetDefinition = {
  id: "notes",
  name: "Quaderno",
  description: "Note organizzate in cartelle, con editor a pagine e scrittura a mano.",
  component: NotesWidget,
  sizes: [SIZE_S, SIZE_M_SQUARE],
  // Nessun defaultPlacement: si aggiunge dal catalogo; la pagina si apre comunque dalla barra laterale.
  detailComponent: NotesDetail,
};
