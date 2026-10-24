import type { SocialModule } from "../../types";
import { PIXY_FEATURE_KEY } from "./feature";
import { PixyPresenceProvider } from "./PixyPresenceProvider";

/** I Pixy di tutti nella Stanza comune: l'aspetto sempre, le espressioni solo di chi le condivide. */
export const pixyModule: SocialModule = {
  key: PIXY_FEATURE_KEY,
  name: "Pixy",
  provider: PixyPresenceProvider,
};
