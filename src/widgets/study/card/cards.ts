import type { ComponentType } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import type { ThemeVariants } from "../../../core/theme/variants";
import StudyCardNotte from "./StudyCardNotte";
import StudyCardOpaco from "./StudyCardOpaco";
import StudyCardQuaderno from "./StudyCardQuaderno";
import StudyCardFosforo from "./StudyCardFosforo";

/**
 * Ogni tema ha la sua card: nei mockup cambiano anche i pezzi, non solo i
 * colori. La usa la dashboard e, in taglia 2×2, il timer della pagina Studio.
 */
export const STUDY_CARDS: ThemeVariants<ComponentType<{ size: SizeKey }>> = {
  notte: StudyCardNotte,
  opaco: StudyCardOpaco,
  quaderno: StudyCardQuaderno,
  fosforo: StudyCardFosforo,
};
