import { CompanionCardFosforo, CompanionCardNotte, CompanionCardOpaco, CompanionCardQuaderno } from "./CompanionCards";

/** La card di ogni tema: la usa la dashboard e, in taglia 2×2, la pagina del Companion. */
export const COMPANION_CARDS = {
  notte: CompanionCardNotte,
  opaco: CompanionCardOpaco,
  quaderno: CompanionCardQuaderno,
  fosforo: CompanionCardFosforo,
};
