import { useEffect, useState, type FormEvent } from "react";
import { ChatEmptyIcon, FireIcon, JoinIcon, LiveIcon, NoSignalIcon, SendIcon, StarIcon, ThumbUpIcon, TrashIcon } from "../groups/components/icons";
import { continuesPrevious, type ChatMessage } from "../modules/chat/chatStore";
import { MESSAGE_MAX, REACTION_KINDS, type ReactionKind } from "../modules/chat/payload";
import { useChat, type ChatSendError } from "../modules/chat/useChat";
import "./RoomChat.css";

const SEND_ERRORS: Record<ChatSendError, string | null> = {
  empty: null,
  too_long: `Al massimo ${MESSAGE_MAX} caratteri.`,
  too_fast: "Aspetta un attimo prima del prossimo messaggio.",
  offline: "Non connesso: il messaggio non è partito.",
  failed: "Non inviato: controlla la connessione e riprova.",
};

const REACTION_LABEL: Record<ReactionKind, string> = { up: "Mi piace", fire: "Fuoco" };

const pad = (n: number) => String(n).padStart(2, "0");

/** Ora locale "hh:mm" di un istante del server. */
function timeText(serverMs: number, offsetMs: number): string {
  const d = new Date(serverMs - offsetMs);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function systemText(message: ChatMessage, name: string): string {
  if (message.kind === "joined") return `${name} è entrato nel gruppo`;
  return `${name} ha studiato ${message.hours === 1 ? "1 ora" : `${message.hours} ore`}`;
}

interface RoomChatProps {
  groupId: string;
  meId: string | null;
  /** utente → nome, dei membri del gruppo */
  names: Map<string, string>;
}

/**
 * La scheda Messaggi della Stanza comune (stanza-comune.html): solo dal vivo, niente sul server. Il testo è sempre
 * testo (React non interpreta HTML) e i link non si aprono. I propri messaggi a destra, eliminabili.
 */
function RoomChat({ groupId, meId, names }: RoomChatProps) {
  const { chats, channels, offsetMs, send, remove, react, setViewing } = useChat();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messages = chats[groupId]?.messages ?? [];
  const online = channels[groupId] === "joined";
  const canSend = online && !sending && draft.trim() !== "";

  // la chat è sotto gli occhi: niente non letti finché la scheda è aperta
  useEffect(() => {
    setViewing(groupId);
    return () => setViewing(null);
  }, [groupId, setViewing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    const result = await send(groupId, draft);
    setSending(false);
    setError(result ? SEND_ERRORS[result] : null);
    if (!result) setDraft("");
  }

  const items = messages.map((m, i) => {
    const name = names.get(m.author) ?? "";
    const time = timeText(m.at, offsetMs);
    if (m.kind !== "msg") {
      return (
        <li key={m.id} className="rch-sys">
          <span className={`rch-sys-icon rch-sys-icon--${m.kind}`}>{m.kind === "joined" ? <JoinIcon /> : <StarIcon />}</span>
          <span>
            {systemText(m, name)} <span className="rch-time">{time}</span>
          </span>
        </li>
      );
    }
    const mine = m.author === meId;
    const cont = continuesPrevious(messages, i);
    return (
      <li key={m.id} className={`rch-msg${mine ? " is-mine" : ""}${cont ? " is-cont" : ""}`}>
        {!cont && !mine && (
          <span className="rch-who">
            <strong>{name}</strong> {time}
          </span>
        )}
        <div className="rch-row">
          <div className={`rch-bubble${m.deleted ? " is-deleted" : ""}`} title={mine ? time : undefined}>
            {m.deleted ? "Messaggio eliminato" : m.text}
          </div>
          {mine && !m.deleted && (
            <button type="button" className="rch-del rch-hover" aria-label="Elimina il messaggio" onClick={() => void remove(groupId, m.id)}>
              <TrashIcon />
            </button>
          )}
        </div>
        {!m.deleted && (
          <div role="group" aria-label="Reazioni" className="rch-reactions">
            {REACTION_KINDS.map((kind) => {
              const who = m.reactions[kind];
              const pressed = meId !== null && who.includes(meId);
              const count = who.length;
              return (
                <button
                  key={kind}
                  type="button"
                  className={`rch-react${pressed ? " is-on" : ""}${count === 0 ? " rch-hover" : ""}`}
                  aria-pressed={pressed}
                  aria-label={`${REACTION_LABEL[kind]}${count ? `, ${count} ${count === 1 ? "persona" : "persone"}` : ""}`}
                  disabled={!online}
                  onClick={() => void react(groupId, m.id, kind, !pressed)}
                >
                  {kind === "up" ? <ThumbUpIcon /> : <FireIcon />}
                  <span>{count || "+"}</span>
                </button>
              );
            })}
          </div>
        )}
      </li>
    );
  });

  return (
    <div className="rch">
      {/* column-reverse: il più nuovo è il primo nel DOM e sta in fondo, la lista parte dal basso */}
      <ol className="rch-list" aria-label="Messaggi del gruppo">
        {items.reverse()}
        {online && messages.length === 0 && (
          <li className="rch-state">
            <ChatEmptyIcon />
            <span>Ancora nessun messaggio da quando sei qui.</span>
          </li>
        )}
        {!online && (
          <li className="rch-state" role="status">
            <NoSignalIcon />
            <span>
              <strong>Non connesso.</strong> I messaggi arrivano solo mentre sei collegato: riprova tra poco.
            </span>
          </li>
        )}
        <li className="rch-live">
          <LiveIcon />
          Solo per chi è connesso adesso, non vengono salvati
        </li>
      </ol>
      <form className="rch-form" onSubmit={(e) => void submit(e)}>
        <div className="rch-compose">
          <label className="rch-field">
            <span className="rch-sr">Scrivi al gruppo</span>
            <input
              type="text"
              className="grp-field rch-input"
              maxLength={MESSAGE_MAX}
              placeholder={online ? "Scrivi al gruppo…" : "Non connesso"}
              value={draft}
              disabled={!online}
              autoComplete="off"
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
            />
          </label>
          <button type="submit" className="rch-send" aria-label="Invia" aria-disabled={!canSend}>
            <SendIcon />
          </button>
        </div>
        {error ? (
          <span className="rch-error" role="alert">
            {error}
          </span>
        ) : (
          <span className="rch-count">
            {draft.length} / {MESSAGE_MAX}
          </span>
        )}
      </form>
    </div>
  );
}

export default RoomChat;
