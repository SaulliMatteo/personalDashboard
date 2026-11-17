import type { ComponentType } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import type { ThemeVariants } from "../../../core/theme/variants";
import CalendarCardNotte from "./CalendarCardNotte";
import CalendarCardOpaco from "./CalendarCardOpaco";
import CalendarCardQuaderno from "./CalendarCardQuaderno";
import CalendarCardFosforo from "./CalendarCardFosforo";

/**
 * Card del Calendario per tema: Notte è quella del mockup; Opaco, Quaderno e Fosforo seguono la tavola "Altri temi"
 * (la 2×2 cambia forma, 1×1 e 2×1 sono quella di base nello stile del tema).
 */
export const CALENDAR_CARDS: ThemeVariants<ComponentType<{ size: SizeKey }>> = {
  notte: CalendarCardNotte,
  opaco: CalendarCardOpaco,
  quaderno: CalendarCardQuaderno,
  fosforo: CalendarCardFosforo,
  // Vetro e Ombra: la card di base, che prende colori e forme dai token del tema
  vetro: CalendarCardNotte,
  ombra: CalendarCardNotte,
};
