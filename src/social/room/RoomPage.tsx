import { useState } from "react";
import { useCloud } from "../../core/cloud/useCloud";
import { useElementSize } from "../../core/hooks/useElementSize";
import { useNav } from "../../core/nav/useNav";
import GroupsStatus from "../groups/components/GroupsStatus";
import { useGroupsState } from "../groups/groupsState";
import { useGroups } from "../groups/useGroups";
import { usePixyPresence } from "../modules/pixy/usePixyPresence";
import { MAX_ROOMS, ROOM_SEATS } from "../modules/study/presence/payload";
import { useStudyPresence } from "../modules/study/presence/useStudyPresence";
import RoomScene, { STAGE_HEIGHT, STAGE_WIDTH } from "./RoomScene";
import RoomSidePanel from "./RoomSidePanel";
import { roomInfo } from "./roomText";
import { assignRooms, memberSections, placeSeats, roomOf, seatOrder } from "./seating";
import { isInRoom, useRoomMembers } from "./useRoomMembers";
import "../groups/components/groupsUi.css";
import "./RoomPage.css";

/** Id del widget Gruppi: la sua pagina di dettaglio è la pagina Gruppi (impostazioni, classifica, report). */
const GROUPS_WIDGET_ID = "groups";

/** Quanto può ingrandirsi la sala rispetto al mockup (720×470) nelle finestre grandi. */
const MAX_SCENE_SCALE = 2;

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

/**
 * La Stanza comune (voce della barra laterale, docs/mockup-gruppi/gruppi/stanza-comune.html): chi studia siede ai
 * tavoli col suo Pixy, a gruppi di 8 per sala; chi è connesso col timer fermo o offline sta "fuori dalla stanza".
 * La pagina sta tutta nella finestra (.main qui non scorre): la sala si adatta allo spazio e scorre solo la lista
 * Membri. Posto e riga della lista condividono la selezione. Creare un gruppo o entrarci si fa dalla pagina Gruppi
 * (dettaglio del widget) o dagli stati senza gruppi, non da qui.
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
  // la sala guardata e la riga aperta valgono per un gruppo: cambiando gruppo si riparte.
  // selected: undefined = la mia riga (all'apertura, come nel mockup), null = nessuna aperta
  const [view, setView] = useState<{ groupId: string | null; room: number | null; selected: string | null | undefined }>({
    groupId: null,
    room: null,
    selected: undefined,
  });
  // la sala si adatta al riquadro (scala uniforme, fino al doppio del mockup)
  const [sceneBox, setSceneBox] = useState<HTMLDivElement | null>(null);
  const { width: sceneWidth, height: sceneHeight } = useElementSize(sceneBox);
  const sceneScale =
    sceneWidth > 0 && sceneHeight > 0 ? Math.min(sceneWidth / STAGE_WIDTH, sceneHeight / STAGE_HEIGHT, MAX_SCENE_SCALE) : 1;

  if (!group) {
    return (
      <div className="roomp">
        <section className="roomp-card roomp-card--state">
          <GroupsStatus state={state === "ok" ? "loading" : state} />
        </section>
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
  const viewState = view.groupId === group.id ? view : { groupId: group.id, room: null, selected: undefined };
  const roomCount = Math.max(rooms.length, ownRoom + 1);
  const shown = Math.min(viewState.room ?? ownRoom, roomCount - 1);
  const inShown = rooms[shown] ?? [];
  // il mio posto scelto lo leggo dalla mia scelta (subito), quello degli altri dalla loro presenza
  const mySeat = myChoice === shown ? (chosenSeats[group.id] ?? null) : null;
  const chosenSeat = (id: string) => (id === userId ? mySeat : (byId.get(id)?.presence?.seat ?? null));
  const order = seatOrder(inShown, userId, (id) => byId.get(id)?.kind === "studying");
  const places = placeSeats(inShown, chosenSeat, order);
  const seats = places.map((id) => (id === null ? null : (byId.get(id) ?? null)));
  // scelto ma non seduto (timer fermo): il posto resta libero, segnato come mio
  const reservedSeat = mySeat !== null && mySeatRoom !== shown && places[mySeat] === null ? mySeat : null;
  const isMyRoom = mySeatRoom >= 0 ? shown === mySeatRoom : myChoice === shown;
  const roomFull = !isMyRoom && inShown.length >= ROOM_SEATS;
  const selectedId = viewState.selected === undefined ? userId : viewState.selected;
  const sections = memberSections(
    rooms,
    shown,
    order,
    away.map((m) => m.userId)
  );

  const update = (patch: Partial<typeof viewState>) => setView({ ...viewState, ...patch });
  // un clic apre la riga (o il posto), un secondo clic sullo stesso la chiude
  const toggle = (id: string) => update({ selected: id === selectedId ? null : id });

  return (
    <div className="roomp">
      <header className="roomp-header">
        <h1>{group.name}</h1>
        <div className="roomp-actions">
          <div className="roomp-rooms" role="group" aria-label={`Sala ${shown + 1} di ${roomCount}, ${roomInfo(inShown.length, ROOM_SEATS)}`}>
            <button
              type="button"
              className="grp-btn grp-btn--ghost roomp-arrow"
              aria-label="Sala precedente"
              disabled={shown === 0}
              onClick={() => update({ room: Math.max(0, shown - 1) })}
            >
              <Arrow dir="prev" />
            </button>
            <span className="roomp-rooms-label">
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
          </div>
          {isMyRoom ? (
            <span className="roomp-here">Sei seduto qui</span>
          ) : roomFull ? (
            <span className="roomp-full">Sala piena</span>
          ) : (
            <button type="button" className="grp-btn roomp-fill" onClick={() => setRoom(group.id, shown)}>
              Siediti in questa sala
            </button>
          )}
          {isMyRoom && chosenSeats[group.id] !== undefined && (
            <button type="button" className="grp-btn grp-btn--ghost" onClick={() => setRoom(group.id, shown)}>
              Posto automatico
            </button>
          )}
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
          <button
            type="button"
            className="grp-btn grp-btn--ghost roomp-icon-btn"
            aria-label="Impostazioni dei gruppi"
            onClick={() => openWidgetDetail(GROUPS_WIDGET_ID)}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <div className="roomp-main">
        <section className="roomp-room" aria-label="La stanza">
          <div ref={setSceneBox} className="roomp-scene" data-pigment={pigment}>
            <RoomScene
              scale={sceneScale}
              seats={seats}
              reservedSeat={reservedSeat}
              onSit={(seat) => setSeat(group.id, shown, seat)}
              pixies={pixyMembers[group.id] ?? {}}
              offsetMs={offsetMs}
              serverNow={serverNow}
              localNow={localNow}
              selectedId={selectedId}
              onSelect={toggle}
            />
          </div>
        </section>

        <RoomSidePanel sections={sections} members={byId} selectedId={selectedId} onToggle={toggle} serverNow={serverNow} />
      </div>
    </div>
  );
}

export default RoomPage;
