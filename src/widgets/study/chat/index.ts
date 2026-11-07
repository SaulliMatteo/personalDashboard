import { MdOutlineMenuBook } from "react-icons/md";
import { defineChatAction } from "../../../core/widgets/chatActions";
import InviteCard from "./InviteCard";
import InviteCompose from "./InviteCompose";
import { INVITE_KIND, describeInvite, parseInvitePayload } from "./invitePayload";

/** "Invita a studiare" nella chat degli amici. */
export const inviteChatAction = defineChatAction({
  kind: INVITE_KIND,
  label: "Invita a studiare",
  hint: "Materia e ora",
  composeTitle: (friend) => `Invita ${friend} a studiare`,
  icon: MdOutlineMenuBook,
  parse: parseInvitePayload,
  describe: describeInvite,
  Compose: InviteCompose,
  Card: InviteCard,
});
