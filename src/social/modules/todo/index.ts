import type { SocialModule } from "../../types";
import { TODO_FEATURE_KEY } from "./feature";
import { TodoProvider } from "./TodoProvider";

/** Il foglietto Da fare della sessione: personale, e condiviso dal vivo solo se lo si sceglie. */
export const todoModule: SocialModule = {
  key: TODO_FEATURE_KEY,
  name: "Da fare",
  provider: TodoProvider,
};
