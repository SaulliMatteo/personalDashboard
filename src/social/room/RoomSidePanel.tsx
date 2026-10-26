import { useEffect, useRef } from "react";
import { MessageIcon, TodoIcon } from "../groups/components/icons";
import { formatStudyTime } from "../modules/study/leaderboard";
import { phaseElapsedSeconds } from "../modules/study/presence/payload";
import { formatClock, lastSeenText } from "./roomText";
import type { MemberSection } from "./seating";
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

/** I dettagli della riga aperta: sessione o pausa in corso, materia (solo se condivisa), oggi e settimana. */
function MemberDetails({ member, serverNow }: { member: RoomMember; serverNow: number }) {
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
    </div>
  );
}

interface RoomSidePanelProps {
  sections: MemberSection[];
  members: Map<string, RoomMember>;
  /** La riga aperta (la stessa selezione del posto nella sala); null = nessuna. */
  selectedId: string | null;
  onToggle: (userId: string) => void;
  serverNow: number;
}

/**
 * La colonna destra della Stanza comune (docs/mockup-gruppi/gruppi/stanza-comune.html): la lista Membri, che scorre
 * dentro il suo riquadro, e i segnaposto Messaggi e Da fare (in arrivo, non interattivi).
 */
function RoomSidePanel({ sections, members, selectedId, onToggle, serverNow }: RoomSidePanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef<HTMLDivElement | null>(null);

  // La riga aperta (anche da un clic sul posto) si porta in vista, scorrendo solo la lista.
  useEffect(() => {
    const list = listRef.current;
    const row = openRef.current;
    if (!list || !row) return;
    const top = row.offsetTop; // .rsp-list è position: relative, quindi è il suo offsetParent
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [selectedId]);

  return (
    <aside className="rsp" aria-label="Persone e attività">
      <section className="rsp-members" aria-labelledby="rsp-members-title">
        <h2 id="rsp-members-title">Membri</h2>
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
                    {open && <MemberDetails member={member} serverNow={serverNow} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <div className="rsp-soon">
        <section aria-labelledby="rsp-msg-title">
          <MessageIcon />
          <h2 id="rsp-msg-title">Messaggi</h2>
          <span>In arrivo</span>
        </section>
        <section aria-labelledby="rsp-todo-title">
          <TodoIcon />
          <h2 id="rsp-todo-title">Da fare</h2>
          <span>In arrivo</span>
        </section>
      </div>
    </aside>
  );
}

export default RoomSidePanel;
