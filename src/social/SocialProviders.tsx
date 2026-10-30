import type { ReactNode } from "react";
import { GroupsProvider } from "./groups/GroupsContext";
import { SOCIAL_MODULES } from "./registry";

/** Monta i gruppi (il nucleo) e sotto i provider dei moduli, come WidgetProviders per i widget. */
function SocialProviders({ children }: { children: ReactNode }) {
  const modules = SOCIAL_MODULES.reduceRight<ReactNode>((inner, socialModule) => {
    const Provider = socialModule.provider;
    return Provider ? <Provider>{inner}</Provider> : inner;
  }, children);
  return <GroupsProvider>{modules}</GroupsProvider>;
}

export default SocialProviders;
