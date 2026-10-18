import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_TALL, SIZE_M_SQUARE } from "../../core/widgets/sizes";
import YoutubeWidget from "./YoutubeWidget";
import YoutubeDetail from "./YoutubeDetail";

export const youtubeWidget: WidgetDefinition = {
  id: "youtube",
  name: "YouTube",
  description: "Salva i video da guardare per lo studio in cartelle, riproducili e prendi appunti a tempo; può contare il tempo come studio.",
  component: YoutubeWidget,
  sizes: [SIZE_TALL, SIZE_M_SQUARE],
  settingsGroup: "youtube",
  // Nessun defaultPlacement: il widget si aggiunge a mano dal catalogo, quindi
  // il layout esistente non viene toccato. Nessun provider: il video si ferma
  // quando si lascia la pagina di dettaglio (la posizione viene salvata).
  detailComponent: YoutubeDetail,
};
