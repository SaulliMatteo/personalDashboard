import type { ComponentType } from "react";
import type { ThemeVariants } from "../../../core/theme/variants";
import { ChartFosforo, ChartNotte, ChartOpaco, ChartQuaderno, type ChartProps } from "./charts";
import { GaugeFosforo, GaugeNotte, GaugeOpaco, GaugeQuaderno, type GaugeProps } from "./gauges";

/**
 * Le parti del Monitor di sistema che cambiano forma col tema (docs/mockup/temi/sysmon.html). Barre, tessere e
 * barre per thread cambiano solo col CSS (SysmonWidget.css, SysmonDetail.css).
 */
export const SYSMON_GAUGES: ThemeVariants<ComponentType<GaugeProps>> = {
  notte: GaugeNotte,
  opaco: GaugeOpaco,
  quaderno: GaugeQuaderno,
  fosforo: GaugeFosforo,
};

export const SYSMON_CHARTS: ThemeVariants<ComponentType<ChartProps>> = {
  notte: ChartNotte,
  opaco: ChartOpaco,
  quaderno: ChartQuaderno,
  fosforo: ChartFosforo,
};
