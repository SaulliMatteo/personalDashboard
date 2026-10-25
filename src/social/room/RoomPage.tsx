import { useState } from "react";
import { useCloud } from "../../core/cloud/useCloud";
import { useElementSize } from "../../core/hooks/useElementSize";
import { useNav } from "../../core/nav/useNav";
import CreateGroupDialog from "../groups/components/CreateGroupDialog";
import GroupsStatus from "../groups/components/GroupsStatus";
import JoinGroupDialog from "../groups/components/JoinGroupDialog";
import { useGroupsState } from "../groups/groupsState";
import { useGroups } from "../groups/useGroups";
import { usePixyPresence } from "../modules/pixy/usePixyPresence";
import { formatStudyTime, KIND_LABELS } from "../modules/study/leaderboard";
import { MAX_ROOMS, phaseElapsedSeconds, ROOM_SEATS } from "../modules/study/presence/payload";
import { useStudyPresence } from "../modules/study/presence/useStudyPresence";
import RoomScene, { STAGE_WIDTH } from "./RoomScene";
import { formatClock, lastSeenText, roomInfo, roomSubtitle } from "./roomText";
import { assignRooms, placeSeats, roomOf, seatOrder } from "./seating";
import { isInRoom, useRoomMembers, type RoomMember } from "./useRoomMembers";
import "../groups/components/groupsUi.css";
import "./RoomPage.css";

/** Id del widget Gruppi: la sua pagina di dettaglio è "Impostazioni della stanza". */
const GROUPS_WIDGET_ID = "groups";

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

function Arrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={dir === "prev" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

/** Il pannello a destra: chi è selezionato, il suo timer, oggi e settimana. */
function Details({ member, serverNow }: { member: RoomMember; serverNow: number }) {
  const p = member.presence;
  const inRoom = isInRoom(member.kind);
  const studying = member.kind === "studying";
  let clockLabel = "Ultima volta";
  let clock = "—";
  if (p && studying) {
    clockLabel = "Sessione in corso";
    clock = formatClock(phaseElapsedSeconds(p, serverNow));
  } else if (p && inRoom) {
    clockLabel = "In pausa da";
    clock = formatClock(member.kind === "break" ? phaseElapsedSeconds(p, serverNow) : (serverNow - p.changedAt) / 1000);
  } else if (member.kind === "online") {
    clockLabel = "Connesso";
    clock = "ora";
  }
  return (
    <aside className="roomp-details" aria-label="Dettagli">
      <div className="roomp-details-head">
        <span className="roomp-details-name">{member.isMe ? `${member.username} (tu)` : member.username}</span>
        <span className="roomp-details-status">
          <span className={`grp-dot grp-dot--${member.kind}`} aria-hidden="true" />
          {inRoom ? KIND_LABELS[member.kind] : "Fuori dalla stanza"}
        </span>
      </div>
      <div className="roomp-clock">
        <span className="roomp-clock-label">{clockLabel}</span>
        <span className={`roomp-clock-value roomp-clock-value--${studying ? "work" : inRoom ? "break" : "off"}`}>{clock}</span>
        <span className="roomp-clock-subject">{studying ? (p?.subject ?? "Materia non condivisa") : " "}</span>
      </div>
      <dl className="roomp-totals">
        <div>
          <dt>Oggi</dt>
          <dd>{formatStudyTime(member.today)}</dd>
        </div>
        <div>
          <dt>Settimana</dt>
          <dd>{formatStudyTime(member.week)}</dd>
        </div>
      </dl>
    </aside>
  );
}

/**
 * La Stanza comune (voce della barra laterale, docs/mockup-gruppi/gruppi/stanza-comune.html): chi studia siede ai
 * tavoli col suo Pixy, a gruppi di 8 per sala; chi è connesso col timer fermo o offline sta "fuori dalla stanza".
 * `pigment`: in Opaco la sala usa il pigmento del widget Gruppi (lo decide il registry, in app/App.tsx).
 */
function RoomPage({ pigment }: { pigment: string }) {
  const { openWidgetDetail } = useNav();
  const { userId } = useCloud();
  const state = useGroupsState();
  const { groups, selectedGroup, selectGroup } = useGroups();
  const { rooms: chosenRooms, seats: chosenSeats, setRoom, setSeat } = useStudyPresence();
  const { members: pixyMembers, offsetMs } = usePixyPresence();
  const group = state === "ok" ? selectedGroup : null;
  const { members, serverNow, localNow } = useRoomMembers(group?.id ?? null);
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);
  // la sala guardata e il posto selezionato valgono per un gruppo: cambiando gruppo si riparte
  const [view, setView] = useState<{ groupId: string | null; room: number | null; selected: string | null }>({
    groupId: null,
    room: null,
    selected: null,
  });
  // la sala si rimpicciolisce per stare tutta nella larghezza disponibile (mai più grande del mockup)
  const [sceneBox, setSceneBox] = useState<HTMLDivElement | null>(null);
  const { width: sceneWidth } = useElementSize(sceneBox);
  const sceneScale = sceneWidth > 0 ? Math.min(1, sceneWidth / STAGE_WIDTH) : 1;

  const dialogs = (
    <>
      {dialog === "create" && <CreateGroupDialog onClose={() => setDialog(null)} />}
      {dialog === "join" && <JoinGroupDialog onClose={() => setDialog(null)} />}
    </>
  );

  if (!group) {
    return (
      <div className="roomp">
        <section className="roomp-card roomp-card--state">
          <GroupsStatus state={state === "ok" ? "loading" : state} />
        </section>
        {dialogs}
      </div>
    );
  }

  const present = members.filter((m) => isInRoom(m.kind));
  const away = members.filter((m) => !isInRoom(m.kind));
  const byId = new Map(members.map((m) => [m.userId, m]));
  const rooms = assignRooms(
    present.map((m) => ({ userId: m.userId, joinedAt: m.joinedAt, room: m.presence?.room ?? null })),
    { seats: ROOM_SEATS, maxRooms: MAX_ROOMS }
  );
  const myChoice = chosenRooms[group.id] ?? null;
  const mySeatRoom = userId ? roomOf(rooms, userId) : -1;
  // da aprire: quella scelta, se no quella in cui siedo, se no la prima
  const ownRoom = mySeatRoom >= 0 ? mySeatRoom : (myChoice ?? 0);
  const viewState = view.groupId === group.id ? view : { groupId: group.id, room: null, selected: null };
  const roomCount = Math.max(rooms.length, ownRoom + 1);
  const shown = Math.min(viewState.room ?? ownRoom, roomCount - 1);
  const inShown = rooms[shown] ?? [];
  // il mio posto scelto lo leggo dalla mia scelta (subito), quello degli altri dalla loro presenza
  const mySeat = myChoice === shown ? (chosenSeats[group.id] ?? null) : null;
  const chosenSeat = (id: string) => (id === userId ? mySeat : (byId.get(id)?.presence?.seat ?? null));
  const places = placeSeats(inShown, chosenSeat, seatOrder(inShown, userId, (id) => byId.get(id)?.kind === "studying"));
  const seats = places.map((id) => (id === null ? null : (byId.get(id) ?? null)));
  // scelto ma non seduto (timer fermo): il posto resta libero, segnato come mio
  const reservedSeat = mySeat !== null && mySeatRoom !== shown && places[mySeat] === null ? mySeat : null;
  const studying = members.filter((m) => m.kind === "studying").length;
  const isMyRoom = mySeatRoom >= 0 ? shown === mySeatRoom : myChoice === shown;
  const roomFull = !isMyRoom && inShown.length >= ROOM_SEATS;
  const selected = byId.get(viewState.selected ?? userId ?? "") ?? members.find((m) => m.isMe) ?? members[0];

  const update = (patch: Partial<typeof viewState>) => setView({ ...viewState, ...patch });

  return (
    <div className="roomp">
      <header className="roomp-header">
        <div className="roomp-titles">
          <h1>{group.name}</h1>
          <span className="roomp-sub">{roomSubtitle(present.length, roomCount, studying, members.length)}</span>
        </div>
        <div className="roomp-actions">
          {groups.length > 0 && (
            <div className="roomp-groups" role="group" aria-label="I miei gruppi">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={g.id === group.id}
                  className={g.id === group.id ? "is-on" : undefined}
                  onClick={() => selectGroup(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="grp-btn grp-btn--ghost" onClick={() => setDialog("join")}>
            Entra con codice
          </button>
          <button type="button" className="grp-btn" onClick={() => setDialog("create")}>
            Crea gruppo
          </button>
          <button
            type="button"
            className="grp-btn grp-btn--ghost roomp-icon-btn"
            aria-label="Impostazioni della stanza"
            onClick={() => openWidgetDetail(GROUPS_WIDGET_ID)}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <div className="roomp-main">
        <section className="roomp-room" aria-label="La stanza">
          <div className="roomp-bar">
            <div className="roomp-bar-nav">
              <button
                type="button"
                className="grp-btn grp-btn--ghost roomp-arrow"
                aria-label="Sala precedente"
                disabled={shown === 0}
                onClick={() => update({ room: Math.max(0, shown - 1) })}
              >
                <Arrow dir="prev" />
              </button>
              <span className="roomp-bar-label">
                Sala {shown + 1} di {roomCount}
              </span>
              <button
                type="button"
                className="grp-btn grp-btn--ghost roomp-arrow"
                aria-label="Sala successiva"
                disabled={shown >= roomCount - 1}
                onClick={() => update({ room: Math.min(roomCount - 1, shown + 1) })}
              >
                <Arrow dir="next" />
              </button>
              <span className="roomp-bar-info">{roomInfo(inShown.length, ROOM_SEATS)}</span>
            </div>
            {isMyRoom && chosenSeats[group.id] !== undefined && (
              <button type="button" className="grp-btn grp-btn--ghost grp-btn--sm" onClick={() => setRoom(group.id, shown)}>
                Posto automatico
              </button>
            )}
            {isMyRoom ? (
              <span className="roomp-here">Sei seduto qui</span>
            ) : roomFull ? (
              <span className="roomp-bar-info">Sala piena</span>
            ) : (
              <button type="button" className="grp-btn grp-btn--sm" onClick={() => setRoom(group.id, shown)}>
                Siediti in questa sala
              </button>
            )}
          </div>
          <div ref={setSceneBox} className="roomp-scroll" data-pigment={pigment}>
            <RoomScene
              scale={sceneScale}
              seats={seats}
              reservedSeat={reservedSeat}
              onSit={(seat) => setSeat(group.id, shown, seat)}
              pixies={pixyMembers[group.id] ?? {}}
              offsetMs={offsetMs}
              serverNow={serverNow}
              localNow={localNow}
              selectedId={selected?.userId ?? null}
              onSelect={(id) => update({ selected: id })}
            />
          </div>
        </section>

        {selected && <Details member={selected} serverNow={serverNow} />}
      </div>

      {away.length > 0 && (
        <section className="roomp-away" aria-labelledby="roomp-away-title">
          <h2 id="roomp-away-title">Fuori dalla stanza</h2>
          {away.map((m) => (
            <button
              key={m.userId}
              type="button"
              className={`roomp-away-chip${selected?.userId === m.userId ? " is-selected" : ""}`}
              aria-pressed={selected?.userId === m.userId}
              onClick={() => update({ selected: m.userId })}
            >
              <span className={`grp-dot grp-dot--${m.kind}`} aria-hidden="true" />
              <span className="roomp-away-name">{m.isMe ? `${m.username} (tu)` : m.username}</span>
              <span className="roomp-away-note">
                {m.kind === "online" ? "online" : lastSeenText(m.lastSeen, serverNow)}, oggi {formatStudyTime(m.today)}
              </span>
            </button>
          ))}
        </section>
      )}
      {dialogs}
    </div>
  );
}

export default RoomPage;
