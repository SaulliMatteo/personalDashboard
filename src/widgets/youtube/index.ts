import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_W, SIZE_S, SIZE_T, SIZE_L } from "../../core/widgets/sizes";
import YoutubeWidget from "./YoutubeWidget";
import YoutubeDetail from "./YoutubeDetail";
import YoutubeMini from "./mini/YoutubeMini";

export const youtubeWidget: WidgetDefinition = {
  id: "youtube",
  name: "YouTube",
  description: "Salva i video da guardare per lo studio in cartelle, riproducili e prendi appunti a tempo; può contare il tempo come studio.",
  component: YoutubeWidget,
  sizes: [SIZE_W, SIZE_S, SIZE_T, SIZE_L],
  defaultPlacement: { x: 3, y: 0, w: 2, h: 1 },
  settingsGroup: "youtube",
  // Nessun provider: il video si ferma
  // quando si lascia la pagina di dettaglio (la posizione viene salvata).
  detailComponent: YoutubeDetail,
  mini: YoutubeMini,
};
