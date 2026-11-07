import { createElement, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  MdArrowBack,
  MdClose,
  MdCloudOff,
  MdMoreHoriz,
  MdAdd,
  MdOutlineForum,
  MdPersonAddAlt,
  MdSearch,
  MdSend,
  MdWifiOff,
} from "react-icons/md";
import type { DirectMessage, FriendProfile } from "../../core/cloud/friendsApi";
import type { PlacedChatAction } from "../../core/widgets/chatActions";
import { useCloud } from "../../core/cloud/useCloud";
import { useNav } from "../../core/nav/useNav";
import { dayLabel } from "../../core/notify/inboxStore";
import Popover from "../../ui/Popover";
import GroupsDialog from "../groups/components/GroupsDialog";
import { useGroups } from "../groups/useGroups";
import { cleanMessageText } from "../modules/chat/payload";
import { messageOf } from "../groups/messages";
import AddFriendDialog from "./AddFriendDialog";
import FriendAvatar from "./FriendAvatar";
import {
  DM_TEXT_MAX,
  continuesPrevious,
  conversation,
  filterFriendRows,
  friendRows,
  isOnline,
  isReadByFriend,
  listTime,
  messageTime,
  previewText,
  seenText,
} from "./friendsStore";
import { useFriends } from "./useFriends";
import "./FriendsPanel.css";

interface FriendsPanelProps {
  /** Il pulsante degli amici: il pannello si apre sotto di lui (sul desktop). */
  anchor: RefObject<HTMLElement | null>;
  /** Telefono: a tutto schermo, prima l'elenco e poi la chat. */
  full: boolean;
  onClose: () => void;
}

/** "In linea" e "visto alle" si aggiornano ogni minuto. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/**
 * Il pannello degli amici (docs/design/amici-notifiche.html, viste 3, 7, 9 e 10): a sinistra richieste, ricerca e
 * amici; a destra la chat salvata. Sul telefono a tutto schermo: dall'elenco si entra nella chat, ← torna indietro.
 */
function FriendsPanel({ anchor, full, onClose }: FriendsPanelProps) {
  const { panel, openChat, closeAdd } = useFriends();
  const showChat = !full || panel.chat !== null;
  const showList = !full || panel.chat === null;

  const body = (
    <>
      {showList && <FriendList full={full} onClose={onClose} />}
      {showChat && <ChatPane full={full} onClose={onClose} />}
      {panel.add && <AddFriendDialog initialCode={panel.addCode} onClose={closeAdd} />}
    </>
  );

  if (full) {
    return createPortal(
      <div
        className="frp frp--full"
        role="dialog"
        aria-modal="true"
        aria-label="Amici"
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          // un dialogo aperto sopra (altro portale) fa risalire qui il suo Esc: quello lo chiude da sé
          if (e.key !== "Escape" || !e.currentTarget.contains(e.target as Node)) return;
          e.stopPropagation();
          if (panel.chat) openChat(null);
          else onClose();
        }}
      >
        {body}
      </div>,
      document.body
    );
  }

  return (
    <Popover anchor={anchor} onClose={onClose} align="end" className="frp frp--pop" label="Amici">
      {body}
    </Popover>
  );
}

/* ---------- Elenco ---------- */

function FriendList({ full, onClose }: { full: boolean; onClose: () => void }) {
  const { status, me, data, panel, openChat, openPanel, describeCard } = useFriends();
  const now = useMinuteClock();
  const [query, setQuery] = useState("");
  const rows = me ? filterFriendRows(friendRows(data, me), query) : [];
  const incoming = data.requests.filter((r) => r.direction === "in").length;
  const usable = status === "ready" || status === "offline";

  return (
    <div className="frp-list">
      <div className="frp-head">
        {full && (
          <button type="button" className="frp-icon-btn" onClick={onClose} aria-label="Indietro">
            <MdArrowBack aria-hidden="true" />
          </button>
        )}
        <h2 className="frp-title">Amici</h2>
        {usable && (
          <button type="button" className="frp-icon-btn frp-icon-btn--fill" onClick={() => openPanel({ add: true })} aria-label="Aggiungi un amico" title="Aggiungi un amico">
            <MdPersonAddAlt aria-hidden="true" />
          </button>
        )}
      </div>

      {!usable ? (
        <PanelState />
      ) : (
        <>
          {status === "offline" && (
            <p className="frp-offline" role="status">
              <MdWifiOff aria-hidden="true" /> Non connesso: riprovo da solo.
            </p>
          )}
          {incoming > 0 && (
            <button type="button" className="frp-req" onClick={() => openPanel({ add: true })}>
              <MdPersonAddAlt aria-hidden="true" />
              <span>Richieste di amicizia</span>
              <b>{incoming}</b>
            </button>
          )}
          {data.friends.length === 0 ? (
            <div className="frp-empty">
              <MdOutlineForum aria-hidden="true" />
              <p>Ancora nessun amico</p>
              <small>Manda il tuo codice a qualcuno o inserisci il suo.</small>
              <button type="button" className="frp-pill frp-pill--primary" onClick={() => openPanel({ add: true })}>
                Aggiungi un amico
              </button>
            </div>
          ) : (
            <>
              <label className="frp-search">
                <MdSearch aria-hidden="true" />
                <input type="search" placeholder="Cerca" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cerca tra gli amici" />
              </label>
              <ul className="frp-rows">
                {rows.map(({ friend, last, unread }) => (
                  <li key={friend.userId}>
                    <button
                      type="button"
                      className={`frp-row${panel.chat === friend.userId && !full ? " is-on" : ""}`}
                      onClick={() => openChat(friend.userId)}
                      aria-current={panel.chat === friend.userId ? "true" : undefined}
                    >
                      <FriendAvatar userId={friend.userId} online={isOnline(friend.lastSeenAt, now)} />
                      <span className="frp-row-text">
                        <b>{friend.username}</b>
                        <span className={unread > 0 ? "is-unread" : undefined}>
                          {last && me ? previewText(last, me, describeCard) : "Scrivi il primo messaggio"}
                        </span>
                      </span>
                      <span className="frp-row-meta">
                        {last && <time dateTime={new Date(last.createdAt).toISOString()}>{listTime(last.createdAt, now)}</time>}
                        {unread > 0 && (
                          <span className="frp-count" aria-label={`${unread} non letti`}>
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
                {rows.length === 0 && <li className="frp-none">Nessun amico con questo nome.</li>}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Pannello vuoto quando gli amici non si possono usare (vista 7): spiega perché e cosa fare. */
function PanelState() {
  const cloud = useCloud();
  const { status } = useFriends();
  const { openSettings } = useNav();
  const kind = cloud.status.kind;

  if (kind === "unconfigured") {
    return <StateBox icon={<MdCloudOff />} title="Amici non disponibili" text="Questa versione dell'app è senza Gruppi, e quindi senza amici." />;
  }
  if (kind === "unavailable") {
    return <StateBox icon={<MdCloudOff />} title="Amici non disponibili" text="Il portachiavi del sistema non è disponibile su questo dispositivo." />;
  }
  if (kind === "signedOut") {
    return (
      <StateBox icon={<MdCloudOff />} title="Accedi per avere gli amici" text="Gli amici usano lo stesso account dei Gruppi.">
        <button type="button" className="frp-pill frp-pill--primary" onClick={() => void cloud.signIn()} disabled={cloud.signingIn}>
          {cloud.signingIn ? "Accesso nel browser…" : "Accedi con Google"}
        </button>
        {cloud.signInError && <small role="alert">{cloud.signInError}</small>}
      </StateBox>
    );
  }
  if (kind === "needsUsername") {
    return (
      <StateBox icon={<MdPersonAddAlt />} title="Scegli un nome utente" text="Gli amici ti vedono con quel nome.">
        <button type="button" className="frp-pill frp-pill--primary" onClick={() => openSettings("account")}>
          Apri Account
        </button>
      </StateBox>
    );
  }
  if (kind === "unreachable") {
    return <StateBox icon={<MdWifiOff />} title="Non connesso" text="Gruppi e amici non raggiungibili: riprovo da solo." />;
  }
  return <StateBox icon={<MdOutlineForum />} title={status === "loading" ? "Carico gli amici…" : "Un attimo…"} text="" />;
}

function StateBox({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="frp-empty">
      <span aria-hidden="true">{icon}</span>
      <p>{title}</p>
      {text && <small>{text}</small>}
      {children}
    </div>
  );
}

/* ---------- Chat ---------- */

function ChatPane({ full, onClose }: { full: boolean; onClose: () => void }) {
  const { me, data, panel, openChat } = useFriends();
  const friend = data.friends.find((f) => f.userId === panel.chat) ?? null;

  if (!friend || !me) {
    return (
      <div className="frp-chat frp-chat--none">
        {!full && (
          <div className="frp-chat-head frp-chat-head--bare">
            <span className="frp-grow" />
            <button type="button" className="frp-icon-btn" onClick={onClose} aria-label="Chiudi">
              <MdClose aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="frp-empty">
          <MdOutlineForum aria-hidden="true" />
          <p>{panel.chat ? "Non siete più amici" : "Scegli un amico"}</p>
          <small>Le chat restano salvate per 90 giorni.</small>
          {full && (
            <button type="button" className="frp-pill" onClick={() => openChat(null)}>
              Torna agli amici
            </button>
          )}
        </div>
      </div>
    );
  }
  return <Chat key={friend.userId} me={me} friend={friend} full={full} onClose={onClose} />;
}

function Chat({ me, friend, full, onClose }: { me: string; friend: FriendProfile; full: boolean; onClose: () => void }) {
  const { status, data, openChat, sendText, sendCard, deleteMessage, removeFriend, actions } = useFriends();
  const { members, selectGroup } = useGroups();
  const { openRoom } = useNav();
  const now = useMinuteClock();
  const messages = conversation(data.messages, me, friend.userId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [composing, setComposing] = useState<PlacedChatAction | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const online = isOnline(friend.lastSeenAt, now);
  const canSend = status === "ready";

  // si parte dal fondo e ci si resta quando arriva un messaggio
  const lastId = messages[messages.length - 1]?.id;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendText(friend.userId, text);
      setText("");
    } catch (err) {
      setError(messageOf(err));
    }
    setSending(false);
  }

  // un gruppo in cui ci siamo tutti e due: gli inviti a studiare aprono la sua Stanza comune
  const sharedGroup = Object.entries(members).find(
    ([, list]) => list.some((x) => x.userId === me) && list.some((x) => x.userId === friend.userId)
  )?.[0];
  const openSharedRoom = sharedGroup
    ? () => {
        selectGroup(sharedGroup);
        openRoom();
      }
    : null;

  /** Manda la scheda di un widget (per Compose): l'errore torna già in italiano. */
  async function sendWidgetCard(kind: string, payload: Record<string, unknown>, comment: string): Promise<string> {
    try {
      return await sendCard(friend.userId, kind, cleanMessageText(comment).slice(0, DM_TEXT_MAX), payload);
    } catch (err) {
      throw new Error(messageOf(err));
    }
  }

  function toggleSelected(m: DirectMessage) {
    setSelected((s) => (s === m.id ? null : m.id));
  }

  async function handleDelete(m: DirectMessage) {
    setSelected(null);
    try {
      await deleteMessage(m.id);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <div className="frp-chat">
      <div className="frp-chat-head">
        {full && (
          <button type="button" className="frp-icon-btn" onClick={() => openChat(null)} aria-label="Torna agli amici">
            <MdArrowBack aria-hidden="true" />
          </button>
        )}
        <FriendAvatar userId={friend.userId} online={online} small />
        <div className="frp-chat-who">
          <b>{friend.username}</b>
          <small>
            {online && <span className="frp-dot" aria-hidden="true" />}
            {seenText(friend.lastSeenAt, now)}
          </small>
        </div>
        <span className="frp-menu-anchor">
          <button
            type="button"
            className="frp-icon-btn"
            aria-label="Altro"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MdMoreHoriz aria-hidden="true" />
          </button>
          {menuOpen && (
            <>
              <span className="frp-menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div
                className="frp-menu"
                role="menu"
                aria-label="Altro"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="frp-menu-item frp-menu-item--danger"
                  autoFocus
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmRemove(true);
                  }}
                >
                  Togli dagli amici
                </button>
              </div>
            </>
          )}
        </span>
        {!full && (
          <button type="button" className="frp-icon-btn" onClick={onClose} aria-label="Chiudi">
            <MdClose aria-hidden="true" />
          </button>
        )}
      </div>

      <div ref={listRef} className="frp-msgs" aria-live="polite">
        {messages.length === 0 && <p className="frp-day">Nessun messaggio: scrivi il primo.</p>}
        {messages.map((m, i) => {
          const mine = m.sender === me;
          const day = dayLabel(m.createdAt, now);
          const newDay = i === 0 || dayLabel(messages[i - 1].createdAt, now) !== day;
          const attached = !newDay && continuesPrevious(messages, i);
          return (
            <div key={m.id} className="frp-msg-wrap">
              {newDay && <span className="frp-day">{day}</span>}
              <div className={`frp-msg${mine ? " is-me" : ""}${attached ? "" : " is-gap"}`}>
                {m.deleted ? (
                  <div className="frp-bub is-deleted">Messaggio eliminato</div>
                ) : m.kind === "text" ? (
                  <div
                    className={`frp-bub${selected === m.id ? " is-selected" : ""}`}
                    onClick={mine ? () => toggleSelected(m) : undefined}
                  >
                    {m.body}
                  </div>
                ) : (
                  <WidgetCard
                    message={m}
                    mine={mine}
                    selected={selected === m.id}
                    friendName={friend.username}
                    actions={actions}
                    onSelect={mine ? () => toggleSelected(m) : undefined}
                    closePanel={onClose}
                    openRoom={openSharedRoom}
                  />
                )}
                <time dateTime={new Date(m.createdAt).toISOString()}>
                  {messageTime(m.createdAt)}
                  {mine && !m.deleted && isReadByFriend(m, data.reads) && (
                    <span className="frp-tick" aria-label="letto">
                      {" "}
                      ✓✓
                    </span>
                  )}
                </time>
                {selected === m.id && mine && !m.deleted && (
                  <button type="button" className="frp-pill frp-pill--danger" onClick={() => void handleDelete(m)} disabled={!canSend}>
                    Elimina
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="frp-error" role="alert">
          {error}
        </p>
      )}
      <form className="frp-compose" onSubmit={handleSubmit}>
        {actions.length > 0 && (
          <span className="frp-plus-anchor">
            <button
              type="button"
              className={`frp-plus${plusOpen ? " is-open" : ""}`}
              aria-label="Manda dai widget"
              title="Manda dai widget"
              aria-haspopup="menu"
              aria-expanded={plusOpen}
              disabled={!canSend}
              onClick={() => setPlusOpen((v) => !v)}
            >
              <MdAdd aria-hidden="true" />
            </button>
            {plusOpen && (
              <PlusMenu
                actions={actions}
                onClose={() => setPlusOpen(false)}
                onPick={(a) => {
                  setPlusOpen(false);
                  setError(null);
                  setComposing(a);
                }}
              />
            )}
          </span>
        )}
        <input
          type="text"
          className="frp-field"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          maxLength={DM_TEXT_MAX}
          placeholder={canSend ? `Scrivi a ${friend.username}…` : "Non connesso: riprovo da solo"}
          aria-label={`Messaggio per ${friend.username}`}
          disabled={!canSend}
          enterKeyHint="send"
        />
        <button type="submit" className="frp-send" aria-label="Invia" disabled={!canSend || sending || !text.trim()}>
          <MdSend aria-hidden="true" />
        </button>
      </form>

      {composing && (
        <GroupsDialog title={composing.composeTitle(friend.username)} wide onClose={() => setComposing(null)}>
          {createElement(composing.Compose, {
            friendName: friend.username,
            send: (payload, comment) => sendWidgetCard(composing.kind, payload, comment),
            onClose: () => setComposing(null),
          })}
        </GroupsDialog>
      )}

      {confirmRemove && (
        <GroupsDialog
          title={`Togliere ${friend.username} dagli amici?`}
          intro="La chat sparisce per tutti e due. Potrete tornare amici con un nuovo codice."
          onClose={() => setConfirmRemove(false)}
        >
          <div className="grp-actions">
            <button type="button" className="grp-btn grp-btn--ghost" onClick={() => setConfirmRemove(false)}>
              Annulla
            </button>
            <button
              type="button"
              className="grp-btn grp-btn--danger"
              onClick={() => {
                setConfirmRemove(false);
                removeFriend(friend.userId).catch((err: unknown) => setError(messageOf(err)));
              }}
            >
              Togli
            </button>
          </div>
        </GroupsDialog>
      )}
    </div>
  );
}

/** Menu del "+" (vista 4): le azioni dei widget. Sul telefono è un foglio dal basso. */
function PlusMenu({
  actions,
  onPick,
  onClose,
}: {
  actions: readonly PlacedChatAction[];
  onPick: (a: PlacedChatAction) => void;
  onClose: () => void;
}) {
  return (
    <>
      <span className="frp-menu-backdrop frp-plus-backdrop" onClick={onClose} />
      <div
        className="frp-plus-menu"
        role="menu"
        aria-label="Manda dai widget"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <span className="frp-plus-head">Dai widget</span>
        {actions.map((a, i) => (
          <button key={a.kind} type="button" role="menuitem" className="frp-plus-item" autoFocus={i === 0} onClick={() => onPick(a)}>
            <span className="frp-plus-ic" data-pigment={a.pigment} aria-hidden="true">
              {createElement(a.icon)}
            </span>
            <span className="frp-plus-text">
              {a.label}
              <small>{a.hint}</small>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

interface WidgetCardProps {
  message: DirectMessage;
  mine: boolean;
  selected: boolean;
  friendName: string;
  actions: readonly PlacedChatAction[];
  onSelect?: () => void;
  closePanel: () => void;
  openRoom: (() => void) | null;
}

/**
 * La scheda di un widget (video, nota, invito…) con il messaggio sotto. Un `kind` sconosciuto (versione più nuova
 * dell'app) o un payload non valido diventano la scheda di ripiego, mai un errore.
 */
function WidgetCard({ message: m, mine, selected, friendName, actions, onSelect, closePanel, openRoom }: WidgetCardProps) {
  const action = actions.find((a) => a.kind === m.kind);
  const card = action?.renderCard({ payload: m.payload, mine, messageId: m.id, friendName, closePanel, openRoom }) ?? null;
  if (!action || !card) {
    return (
      <div className={`frp-bub frp-bub--unknown${selected ? " is-selected" : ""}`} onClick={onSelect}>
        {action ? "Contenuto non valido." : "Contenuto non supportato da questa versione dell'app."}
        {m.body && <span>{m.body}</span>}
      </div>
    );
  }
  return (
    <>
      <div className={`frp-card${selected ? " is-selected" : ""}`} data-pigment={action.pigment} onClick={onSelect}>
        {card}
      </div>
      {m.body && (
        <div className={`frp-bub${selected ? " is-selected" : ""}`} onClick={onSelect}>
          {m.body}
        </div>
      )}
    </>
  );
}

export default FriendsPanel;
