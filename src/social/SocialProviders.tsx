import type { ReactNode } from "react";
import { GroupsProvider } from "./groups/GroupsContext";
import { FriendsProvider } from "./friends/FriendsProvider";
import { SOCIAL_MODULES } from "./registry";

/** Monta i gruppi (il nucleo), gli amici e sotto i provider dei moduli, come WidgetProviders per i widget. */
function SocialProviders({ children }: { children: ReactNode }) {
  const modules = SOCIAL_MODULES.reduceRight<ReactNode>((inner, socialModule) => {
    const Provider = socialModule.provider;
    return Provider ? <Provider>{inner}</Provider> : inner;
  }, children);
  // gli amici sono a parte dai gruppi (stesso account), con le loro chat salvate
  return (
    <GroupsProvider>
      <FriendsProvider>{modules}</FriendsProvider>
    </GroupsProvider>
  );
}

export default SocialProviders;
