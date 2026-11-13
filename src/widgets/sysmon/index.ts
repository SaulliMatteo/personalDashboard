import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_M, SIZE_S, SIZE_W } from "../../core/widgets/sizes";
import SysmonWidget from "./SysmonWidget";
import SysmonDetail from "./SysmonDetail";
import { SysmonProvider } from "./SysmonContext";
import { SYSMON_WIDGET_ID } from "./useSysmon";

export const sysmonWidget: WidgetDefinition = {
  id: SYSMON_WIDGET_ID,
  name: "Monitor di sistema",
  description: "CPU, GPU, memoria, dischi, rete, temperature e processi di questo computer, aggiornati ogni pochi secondi.",
  component: SysmonWidget,
  sizes: [SIZE_S, SIZE_W, SIZE_M],
  detailComponent: SysmonDetail,
  settingsGroup: "sysmon",
  // Non misura nulla da solo: il campionatore parte solo con il widget o la pagina sullo schermo.
  provider: SysmonProvider,
};
