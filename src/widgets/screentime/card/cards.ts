import type { ComponentType } from "react";
import { perMode, type ThemeVariants } from "../../../core/theme/variants";
import { RingEclisse, RingFosforo, RingNotte, RingOpaco, RingQuaderno, RingStella, RingVetro, type RingProps } from "./rings";

/**
 * Le parti di Tempo allo schermo che cambiano forma col tema (docs/mockup/widget/tempo-allo-schermo.html). Barre,
 * blocchi della giornata e pallini cambiano solo col CSS (ScreenTimeWidget.css).
 */
export const SCREENTIME_RINGS: ThemeVariants<ComponentType<RingProps>> = {
  notte: RingNotte,
  opaco: RingOpaco,
  quaderno: RingQuaderno,
  fosforo: RingFosforo,
  vetro: RingVetro,
  // Ombra: due linguaggi, eclisse di notte e stella di giorno (docs/TEMI.md).
  ombra: perMode({ notte: RingEclisse, giorno: RingStella }),
};
