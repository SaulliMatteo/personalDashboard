import type { ReactNode } from "react";
import type { PlacedChatAction } from "../core/widgets/chatActions";
import { GroupsProvider } from "./groups/GroupsContext";
import { FriendsProvider } from "./friends/FriendsProvider";
import { SOCIAL_MODULES } from "./registry";

/** Monta i gruppi (il nucleo), gli amici e sotto i provider dei moduli, come WidgetProviders per i widget. */
interface SocialProvidersProps {
  /** Le azioni dei widget nella chat degli amici (dal registry, raccolte da app/App.tsx). */
  chatActions: readonly PlacedChatAction[];
  children: ReactNode;
}

function SocialProviders({ chatActions, children }: SocialProvidersProps) {
  const modules = SOCIAL_MODULES.reduceRight<ReactNode>((inner, socialModule) => {
    const Provider = socialModule.provider;
    return Provider ? <Provider>{inner}</Provider> : inner;
  }, children);
  // gli amici sono a parte dai gruppi (stesso account), con le loro chat salvate
  return (
    <GroupsProvider>
      <FriendsProvider actions={chatActions}>{modules}</FriendsProvider>
    </GroupsProvider>
  );
}

export default SocialProviders;
