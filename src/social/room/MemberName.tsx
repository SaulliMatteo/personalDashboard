import "./MemberName.css";

/**
 * Il nome di un membro nella Stanza comune (lista e targhetta del posto): il mio è "Matteo · io". Se non c'è spazio
 * si accorcia il nome, mai "· io".
 */
function MemberName({ username, isMe }: { username: string; isMe: boolean }) {
  return (
    <span className="mname">
      <span className="mname-text">{username}</span>
      {isMe && <span className="mname-me"> · io</span>}
    </span>
  );
}

export default MemberName;
