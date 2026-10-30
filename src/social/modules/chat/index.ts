import type { SocialModule } from "../../types";
import { ChatProvider } from "./ChatProvider";
import { CHAT_FEATURE_KEY } from "./feature";

/** Messaggi del gruppo, solo dal vivo: arrivano a chi è connesso e non restano sul server. */
export const chatModule: SocialModule = {
  key: CHAT_FEATURE_KEY,
  name: "Messaggi",
  provider: ChatProvider,
};
