import { MdOutlineMenuBook } from "react-icons/md";
import type { ChatCardProps } from "../../../core/widgets/chatActions";
import { useNav } from "../../../core/nav/useNav";
import { ChatCard, ChatCardButton } from "../../../ui/ChatCard";
import type { InviteCardPayload } from "./invitePayload";
import "./InviteChat.css";

/**
 * Scheda di un invito a studiare (docs/design/amici-notifiche.html, vista 9): materia e ora; "Apri la Stanza" se
 * siamo in un gruppo insieme, sempre "Studio".
 */
function InviteCard({ payload, mine, friendName, closePanel, openRoom }: ChatCardProps<InviteCardPayload>) {
  const { openWidgetDetail } = useNav();

  return (
    <ChatCard
      source="Studio"
      icon={<MdOutlineMenuBook />}
      actions={
        <>
          {openRoom && (
            <ChatCardButton
              primary
              onClick={() => {
                closePanel();
                openRoom();
              }}
            >
              Apri la Stanza
            </ChatCardButton>
          )}
          <ChatCardButton
            primary={!openRoom}
            onClick={() => {
              closePanel();
              openWidgetDetail("study");
            }}
          >
            Studio
          </ChatCardButton>
        </>
      }
    >
      <div className="stc-invite">
        {/* colore della materia: scelto dall'utente */}
        {payload.subject && <i style={{ background: payload.subject.color }} aria-hidden="true" />}
        <b>{payload.subject?.name ?? "Studiamo insieme"}</b>
        <span>{payload.at ?? "adesso"}</span>
      </div>
      <p className="stc-who">{mine ? `Hai invitato ${friendName} a studiare` : `${friendName} ti invita a studiare`}</p>
    </ChatCard>
  );
}

export default InviteCard;
