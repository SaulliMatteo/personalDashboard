import type { ComponentType } from "react";
import type { ThemeVariants } from "../../../core/theme/variants";
import { RingFosforo, RingNotte, RingOpaco, RingQuaderno, type RingProps } from "./rings";

/**
 * Le parti di Tempo al PC che cambiano forma col tema (docs/mockup/temi/tempo-pc.html). Barre, colonne delle ore e
 * pallini cambiano solo col CSS (ScreenTimeWidget.css).
 */
export const SCREENTIME_RINGS: ThemeVariants<ComponentType<RingProps>> = {
  notte: RingNotte,
  opaco: RingOpaco,
  quaderno: RingQuaderno,
  fosforo: RingFosforo,
};
