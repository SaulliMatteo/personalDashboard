import { avatarTint } from "./friendsStore";
import "./FriendAvatar.css";

interface FriendAvatarProps {
  userId: string;
  online?: boolean;
  small?: boolean;
}

/** La faccina di un amico: gli occhi di Pixy su una tinta fissa per ogni utente (i profili non hanno foto). */
function FriendAvatar({ userId, online = false, small = false }: FriendAvatarProps) {
  return (
    <span className={`fav${small ? " fav--sm" : ""}`} data-tint={avatarTint(userId)} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="6" y="8" width="4" height="7" rx="1.6" />
        <rect x="14" y="8" width="4" height="7" rx="1.6" />
      </svg>
      {online && <i className="fav-on" />}
    </span>
  );
}

export default FriendAvatar;
