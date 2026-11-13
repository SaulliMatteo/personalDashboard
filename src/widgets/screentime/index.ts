import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_M, SIZE_S, SIZE_T, SIZE_W } from "../../core/widgets/sizes";
import ScreenTimeWidget from "./ScreenTimeWidget";
import ScreenTimeDetail from "./ScreenTimeDetail";
import { ScreenTimeProvider } from "./ScreenTimeContext";
import { SCREENTIME_WIDGET_ID } from "./useScreenTime";

export const screenTimeWidget: WidgetDefinition = {
  id: SCREENTIME_WIDGET_ID,
  name: "Tempo al PC",
  description: "Quanto tempo passi al computer e su quali app e siti, con focus e svago, limiti giornalieri e promemoria delle pause.",
  component: ScreenTimeWidget,
  sizes: [SIZE_M, SIZE_S, SIZE_W, SIZE_T],
  detailComponent: ScreenTimeDetail,
  settingsGroup: "screentime",
  // Conta anche col widget fuori dalla dashboard e con la finestra nascosta vicino all'orologio.
  provider: ScreenTimeProvider,
};
