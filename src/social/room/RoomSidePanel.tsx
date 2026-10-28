import { useEffect, useRef, useState } from "react";
import { useSettings } from "../../core/settings/useSettings";
import { DoneMarkIcon, OpenMarkIcon } from "../groups/components/icons";
import { useChat } from "../modules/chat/useChat";
import { formatStudyTime } from "../modules/study/leaderboard";
import { sharedOrder, todoProgress, type SharedTodo } from "../modules/todo/payload";
import { useTodo } from "../modules/todo/useTodo";
import { phaseElapsedSeconds } from "../modules/study/presence/payload";
import { formatClock, lastSeenText } from "./roomText";
import type { MemberSection } from "./seating";
import RoomChat from "./RoomChat";
import RoomTodo from "./RoomTodo";
import { isInRoom, type RoomMember } from "./useRoomMembers";
import "./RoomSidePanel.css";

/** Da quanto è in pausa: pausa del pomodoro = tempo della fase, timer fermato = dall'ultimo cambio. */
function pauseSeconds(member: RoomMember, serverNow: number): number {
  const p = member.presence;
  if (!p) return 0;
  return member.kind === "break" ? phaseElapsedSeconds(p, serverNow) : Math.max(0, (serverNow - p.changedAt) / 1000);
}

/** Il testo breve a destra della riga: timer, "pausa mm:ss", "online" o da quanto non si vede. */
function shortText(member: RoomMember, room: number | null, serverNow: number): string {
  const where = room === null ? "" : `Sala ${room + 1}, `;
  const p = member.presence;
  if (p && member.kind === "studying") return where + formatClock(phaseElapsedSeconds(p, serverNow));
  if (isInRoom(member.kind)) return `${where}pausa ${formatClock(pauseSeconds(member, serverNow))}`;
  return where + (member.kind === "online" ? "online" : lastSeenText(member.lastSeen, serverNow));
}

/** Il foglietto Da fare di un membro, in sola lettura: prima le voci da fare, poi quelle fatte sbarrate. */
function MemberSheet({ items, isMe }: { items: SharedTodo[]; isMe: boolean }) {
  const { done, total } = todoProgress(items);
  const title = isMe ? "Il tuo foglietto, come lo vedono gli altri" : "Da fare";
  return (
    <div className="rsp-sheet">
      <span className="rsp-sheet-head">
        <span>{title}</span>
        <span aria-label={`${done} fatte su ${total}`}>
          {done} di {total}
        </span>
      </span>
      <ul aria-label={title}>
        {items.map((item, i) => (
          <li key={i} className={item.done ? "is-done" : undefined}>
            {item.done ? <DoneMarkIcon /> : <OpenMarkIcon />}
            <span className="rsp-sheet-text">
              {item.text}
              {item.done && <span className="rsp-sr"> (fatta)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** I dettagli della riga aperta: sessione o pausa in corso, materia (solo se condivisa), oggi e settimana, foglietto. */
function MemberDetails({ member, serverNow, sheet }: { member: RoomMember; serverNow: number; sheet: SharedTodo[] | null }) {
  const p = member.presence;
  const studying = member.kind === "studying";
  const inRoom = isInRoom(member.kind);
  let label = "Ultima volta";
  let clock = "—";
  let note = lastSeenText(member.lastSeen, serverNow);
  if (p && studying) {
    label = "Sessione in corso";
    clock = formatClock(phaseElapsedSeconds(p, serverNow));
    note = p.subject ?? "Materia non condivisa";
  } else if (inRoom) {
    label = "In pausa da";
    clock = formatClock(pauseSeconds(member, serverNow));
    note = "In pausa";
  } else if (member.kind === "online") {
    label = "Connesso";
    clock = "ora";
    note = "Timer fermo";
  }
  return (
    <div className="rsp-details">
      <div className="rsp-clock">
        <span className="rsp-label">{label}</span>
        <span className={`rsp-clock-value rsp-clock-value--${studying ? "work" : inRoom ? "break" : "off"}`}>{clock}</span>
        <span className="rsp-note">{note}</span>
      </div>
      <dl className="rsp-totals">
        <div>
          <dt>Oggi</dt>
          <dd>{formatStudyTime(member.today)}</dd>
        </div>
        <div>
          <dt>Settimana</dt>
          <dd>{formatStudyTime(member.week)}</dd>
        </div>
      </dl>
      {sheet && sheet.length > 0 && <MemberSheet items={sheet} isMe={member.isMe} />}
    </div>
  );
}

type PanelTab = "members" | "chat" | "todo";

interface RoomSidePanelProps {
  groupId: string;
  meId: string | null;
  sections: MemberSection[];
  members: Map<string, RoomMember>;
  /** La riga aperta (la stessa selezione del posto nella sala); null = nessuna. */
  selectedId: string | null;
  onToggle: (userId: string) => void;
  serverNow: number;
  /** Apre "Cosa vedono gli altri" nella pagina Gruppi. */
  onOpenSharing: () => void;
}

/**
 * La colonna destra della Stanza comune (docs/mockup-gruppi/gruppi/stanza-comune.html), a schede: Membri (la lista
 * scorre dentro il riquadro), Messaggi (dal vivo) e Da fare (il foglietto della sessione). I badge contano i messaggi
 * non letti e le voci ancora da fare.
 */
function RoomSidePanel({ groupId, meId, sections, members, selectedId, onToggle, serverNow, onOpenSharing }: RoomSidePanelProps) {
  const { settings } = useSettings();
  const { chats } = useChat();
  const { items, shared } = useTodo();
  const [tab, setTab] = useState<PanelTab>("members");
  const [shownSelection, setShownSelection] = useState(selectedId);
  const listRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef<HTMLDivElement | null>(null);

  // un posto scelto nella sala si vede nella lista Membri
  if (selectedId !== shownSelection) {
    setShownSelection(selectedId);
    if (selectedId !== null) setTab("members");
  }

  // La riga aperta (anche da un clic sul posto) si porta in vista, scorrendo solo la lista.
  useEffect(() => {
    const list = listRef.current;
    const row = openRef.current;
    if (!list || !row) return;
    const top = row.offsetTop; // .rsp-list è position: relative, quindi è il suo offsetParent
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [selectedId, tab]);

  const unread = tab === "chat" ? 0 : (chats[groupId]?.unread ?? 0);
  const openTodos = items.filter((i) => !i.done).length;
  const names = new Map([...members.values()].map((m) => [m.userId, m.username]));
  const mySheet = settings.groupsShareTodo ? sharedOrder(items) : null;
  const sheetOf = (member: RoomMember) => (member.isMe ? mySheet : (shared[groupId]?.[member.userId] ?? null));

  const tabs: { id: PanelTab; label: string; badge: number; badgeLabel: string }[] = [
    { id: "members", label: "Membri", badge: 0, badgeLabel: "" },
    { id: "chat", label: "Messaggi", badge: unread, badgeLabel: `${unread} ${unread === 1 ? "messaggio nuovo" : "messaggi nuovi"}` },
    { id: "todo", label: "Da fare", badge: openTodos, badgeLabel: `${openTodos} ${openTodos === 1 ? "cosa da fare" : "cose da fare"}` },
  ];

  return (
    <aside className="rsp" aria-label="Persone e attività">
      <div role="tablist" aria-label="Colonna della stanza" className="rsp-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`rsp-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`rsp-panel-${t.id}`}
            className={`rsp-tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            {t.badge > 0 && (
              <span className={`rsp-badge rsp-badge--${t.id}`} aria-label={t.badgeLabel}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`rsp-panel-${tab}`} aria-labelledby={`rsp-tab-${tab}`} className="rsp-panel">
        {tab === "members" && (
          <div ref={listRef} className="rsp-list">
            {sections.map((section) => (
              <div key={section.title} className="rsp-section">
                <span className="rsp-section-title">
                  {section.title} ({section.members.length})
                </span>
                {section.members.map(({ userId, room }) => {
                  const member = members.get(userId);
                  if (!member) return null;
                  const open = userId === selectedId;
                  return (
                    <div key={userId} ref={open ? openRef : undefined} className={`rsp-row${open ? " is-open" : ""}`}>
                      <button type="button" className="rsp-row-btn" aria-expanded={open} onClick={() => onToggle(userId)}>
                        <span className={`grp-dot grp-dot--${member.kind}`} aria-hidden="true" />
                        <span className="rsp-name">{member.isMe ? `${member.username} (tu)` : member.username}</span>
                        <span className={`rsp-short rsp-short--${member.kind}`}>{shortText(member, room, serverNow)}</span>
                      </button>
                      {open && <MemberDetails member={member} serverNow={serverNow} sheet={sheetOf(member)} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {tab === "chat" && <RoomChat groupId={groupId} meId={meId} names={names} />}
        {tab === "todo" && <RoomTodo onOpenSharing={onOpenSharing} />}
      </div>
    </aside>
  );
}

export default RoomSidePanel;
