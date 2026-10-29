import type { ComponentType } from "react";
import type { SizeKey } from "../../../core/widgets/sizes";
import type { ThemeVariants } from "../../../core/theme/variants";
import { NotesCardFosforo, NotesCardNotte, NotesCardOpaco, NotesCardQuaderno } from "./NotesCards";

/**
 * La card di ogni tema (docs/design/temi/notes-redesign.html): la 1×1 cambia
 * oggetto (ghiera, numero su pigmento, post-it, display), 3×1 e 2×2 cambiano forma.
 */
export const NOTES_CARDS: ThemeVariants<ComponentType<{ size: SizeKey }>> = {
  notte: NotesCardNotte,
  opaco: NotesCardOpaco,
  quaderno: NotesCardQuaderno,
  fosforo: NotesCardFosforo,
};
