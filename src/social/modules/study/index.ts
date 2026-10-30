import type { SocialModule } from "../../types";
import { STUDY_FEATURE_KEY } from "./feature";
import { StudyProvider } from "./StudyProvider";

/** Studio insieme: chi sta studiando adesso e i totali di oggi e della settimana. */
export const studyModule: SocialModule = {
  key: STUDY_FEATURE_KEY,
  name: "Studio",
  provider: StudyProvider,
};
