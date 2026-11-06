import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_W, SIZE_S, SIZE_T, SIZE_L } from "../../core/widgets/sizes";
import YoutubeWidget from "./YoutubeWidget";
import YoutubeDetail from "./YoutubeDetail";
import YoutubeMini from "./mini/YoutubeMini";
import { YoutubeProvider } from "./YoutubeContext";

export const youtubeWidget: WidgetDefinition = {
  id: "youtube",
  name: "YouTube",
  description: "Salva i video da guardare per lo studio in cartelle, riproducili e prendi appunti a tempo; può contare il tempo come studio.",
  component: YoutubeWidget,
  sizes: [SIZE_W, SIZE_S, SIZE_T, SIZE_L],
  defaultPlacement: { x: 3, y: 0, w: 2, h: 1 },
  settingsGroup: "youtube",
  // Il provider non tiene in vita il player (il video si ferma lasciando la pagina, la posizione viene
  // salvata): riempie solo, in sottofondo, le durate mancanti (lib/durationFill.ts).
  provider: YoutubeProvider,
  detailComponent: YoutubeDetail,
  mini: YoutubeMini,
};
