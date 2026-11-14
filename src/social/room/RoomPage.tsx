import { useState, type ReactNode } from "react";
import { useCloud } from "../../core/cloud/useCloud";
import { useElementSize } from "../../core/hooks/useElementSize";
import { useCompact, useLandscape } from "../../core/layout/useCompact";
import { useDrawer } from "../../core/nav/useDrawer";
import { useNav } from "../../core/nav/useNav";
import { useSettings } from "../../core/settings/useSettings";
import CompactBar from "../../ui/CompactBar";
import GroupsStatus from "../groups/components/GroupsStatus";
import { useGroupsState } from "../groups/groupsState";
import { useGroups } from "../groups/useGroups";
import { usePixyPresence } from "../modules/pixy/usePixyPresence";
import { MAX_ROOMS, ROOM_SEATS } from "../modules/study/presence/payload";
import { useStudyPresence } from "../modules/study/presence/useStudyPresence";
import RoomScene, { STAGE_HEIGHT, STAGE_WIDTH } from "./RoomScene";
import { requestGroupsSharing } from "../widget/groupsPageIntent";
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
 * La Stanza comune (voce della barra laterale, docs/mockup/gruppi/stanza-comune.html): chi studia siede ai
 * tavoli col suo Pixy, a gruppi di 8 per sala; col timer fermo si resta seduti per compagnia (groupsSitInRoom,
 * "Alzati" lo spegne), e "fuori dalla stanza" sta chi si è alzato o è offline.
 * La pagina sta tutta nella finestra (.main qui non scorre): la sala si adatta allo spazio e scorre solo la lista
 * Membri. Posto e riga della lista condividono la selezione. Creare un gruppo o entrarci si fa dalla pagina Gruppi
 * (dettaglio del widget) o dagli stati senza gruppi, non da qui.
 * `pigment`: in Opaco la sala usa il pigmento del widget Gruppi (lo decide il registry, in app/App.tsx).
 * `controls`: i comandi dei widget per la stanza (`roomControls`, es. il timer dello Studio), passati da app/App.tsx.
 * Sul telefono (docs/mockup/mobile/viste.html, vista 8): nome del gruppo e sala nella barra in alto, sotto gruppi e
 * frecce delle sale, poi posto e timer, la sala a tutta larghezza e le schede sotto, dove scorre solo la lista.
 * In verticale (docs/mockup/mobile/ritocchi.html, viste 14 e 15) la sala è a grandezza vera e girata (si scorre) e le
 * schede stanno in un foglio in fondo che si alza.
 */
function RoomPage({ pigment, controls }: { pigment: string; controls?: ReactNode }) {
  const { openWidgetDetail } = useNav();
  const compact = useCompact();
  const landscape = useLandscape();
  const column = compact && !landscape;
  const { setOpen: openDrawer } = useDrawer();
  const { userId } = useCloud();
  const { settings, updateSetting } = useSettings();
  const state = useGroupsState();
  const { groups, selectedGroup, selectGroup } = useGroups();
  const { rooms: chosenRooms, seats: chosenSeats, setRoom, setSeat } = useStudyPresence();
  const { members: pixyMembers, offsetMs } = usePixyPresence();
  const group = state === "ok" ? selectedGroup : null;
  const { members, serverNow, localNow } = useRoomMembers(group?.id ?? null);
  // la sala guardata e la riga aperta valgono per un gruppo: cambiando gruppo si riparte (nessuna riga aperta)
  const [view, setView] = useState<{ groupId: string | null; room: number | null; selected: string | null }>({
    groupId: null,
    room: null,
    selected: null,
  });
  // la sala si adatta al riquadro (scala uniforme, fino al doppio del mockup)
  const [sceneBox, setSceneBox] = useState<HTMLDivElement | null>(null);
  const { width: sceneWidth, height: sceneHeight } = useElementSize(sceneBox);
  const sceneScale =
    sceneWidth > 0 && sceneHeight > 0 ? Math.min(sceneWidth / STAGE_WIDTH, sceneHeight / STAGE_HEIGHT, MAX_SCENE_SCALE) : 1;

  const settingsButton = (
    <button
      type="button"
      className="grp-btn grp-btn--ghost roomp-icon-btn"
      aria-label="Impostazioni dei gruppi"
      onClick={() => openWidgetDetail(GROUPS_WIDGET_ID)}
    >
      <SettingsIcon />
    </button>
  );
  // la barra del telefono: ☰, il nome del gruppo (o della pagina) e le impostazioni dei gruppi
  const compactBar = (title: string, subtitle?: string) =>
    compact ? (
      <CompactBar
        lead="menu"
        onLead={() => openDrawer(true)}
        title={title}
        subtitle={subtitle}
        actions={
          group ? (
            <button type="button" className="cbar-btn" aria-label="Impostazioni dei gruppi" onClick={() => openWidgetDetail(GROUPS_WIDGET_ID)}>
              <SettingsIcon />
            </button>
          ) : undefined
        }
      />
    ) : null;

  if (!group) {
    return (
      <div className="roomp">
        {compactBar("Stanza comune")}
        <section className="roomp-card roomp-card--state">
          <GroupsStatus state={state === "ok" ? "loading" : state} />
        </section>
      </div>
    );
  }

  const present = members.filter((m) => m.seated);
  const away = members.filter((m) => !m.seated);
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
  const order = seatOrder(inShown, userId, (id) => byId.get(id)?.kind === "studying");
  const places = placeSeats(inShown, chosenSeat, order);
  const seats = places.map((id) => (id === null ? null : (byId.get(id) ?? null)));
  // scelto ma alzato (timer fermo): il posto resta libero, segnato come mio
  const reservedSeat = mySeat !== null && mySeatRoom !== shown && places[mySeat] === null ? mySeat : null;
  const roomFull = mySeatRoom !== shown && inShown.length >= ROOM_SEATS;
  const selectedId = viewState.selected;
  const sections = memberSections(
    rooms,
    shown,
    order,
    away.map((m) => m.userId)
  );

  const me = userId ? byId.get(userId) : undefined;
  // alzarsi si può solo col timer fermo: chi studia siede comunque
  const canStand = me !== undefined && me.seated && !isInRoom(me.kind);
  // sedersi in una sala o su un posto vale anche col timer fermo: si resta seduti per compagnia
  const sitDown = () => {
    if (!settings.groupsSitInRoom) updateSetting("groupsSitInRoom", true);
  };

  const update = (patch: Partial<typeof viewState>) => setView({ ...viewState, ...patch });
  // un clic apre la riga (o il posto), un secondo clic sullo stesso la chiude
  const toggle = (id: string) => update({ selected: id === selectedId ? null : id });

  const seatStatus = (
    <>
      {/* seduto di default anche col timer fermo, per compagnia; "Alzati" porta fuori dalla stanza finché non studi */}
      {mySeatRoom === shown ? (
        <span className="roomp-here">Sei seduto qui</span>
      ) : roomFull ? (
        <span className="roomp-full">Sala piena</span>
      ) : (
        <button
          type="button"
          className="grp-btn roomp-fill"
          onClick={() => {
            setRoom(group.id, shown);
            sitDown();
          }}
        >
          Siediti in questa sala
        </button>
      )}
      {mySeatRoom === shown && canStand && (
        <button type="button" className="grp-btn grp-btn--ghost" onClick={() => updateSetting("groupsSitInRoom", false)}>
          Alzati
        </button>
      )}
      {mySeatRoom === shown && chosenSeats[group.id] !== undefined && (
        <button type="button" className="grp-btn grp-btn--ghost" onClick={() => setRoom(group.id, shown)}>
          Posto automatico
        </button>
      )}
    </>
  );
  // sul telefono il posto è una riga a sé, con una frase che dice perché sei seduto o no (novita.html, viste 7 e 8)
  const seatedHere = mySeatRoom === shown;
  const seatTitle = seatedHere ? "Sei seduto qui" : mySeatRoom >= 0 ? `Sei nella Sala ${mySeatRoom + 1}` : "Sei fuori dalla stanza";
  const seatSub = seatedHere
    ? me && isInRoom(me.kind)
      ? "Stai studiando"
      : "In compagnia, timer fermo"
    : roomFull
      ? "Questa sala è piena"
      : mySeatRoom >= 0
        ? "Puoi spostarti in questa sala"
        : "Ti risiedi da solo quando avvii il timer";
  const seatBar = (
    <div className={`roomp-seatbar${seatedHere ? " is-seated" : ""}`}>
      <span className="roomp-seatbar-dot" aria-hidden="true" />
      <div className="roomp-seatbar-text">
        <span className="roomp-seatbar-title">{seatTitle}</span>
        <span className="roomp-seatbar-sub">{seatSub}</span>
        {seatedHere && chosenSeats[group.id] !== undefined && (
          <button type="button" className="roomp-seatbar-link" onClick={() => setRoom(group.id, shown)}>
            Posto automatico
          </button>
        )}
      </div>
      {seatedHere
        ? canStand && (
            <button type="button" className="grp-btn grp-btn--ghost" onClick={() => updateSetting("groupsSitInRoom", false)}>
              Alzati
            </button>
          )
        : !roomFull && (
            <button
              type="button"
              className="grp-btn roomp-fill"
              onClick={() => {
                setRoom(group.id, shown);
                sitDown();
              }}
            >
              {mySeatRoom >= 0 ? "Siediti qui" : "Siediti"}
            </button>
          )}
    </div>
  );
  const groupChips = groups.length > 0 && (
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
  );
  // sul telefono "Sala 1 di 2" sta nella barra in alto: qui restano le frecce
  const roomArrows = (
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
      {!compact && (
        <span className="roomp-rooms-label">
          Sala {shown + 1} di {roomCount}
        </span>
      )}
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
  );

  return (
    <div className="roomp">
      {compactBar(group.name, `Sala ${shown + 1} di ${roomCount} · ${roomInfo(inShown.length, ROOM_SEATS)}`)}
      {compact ? (
        <header className="roomp-header roomp-header--compact">
          <div className="roomp-row">
            {groupChips}
            {roomArrows}
          </div>
          {seatBar}
          <div className="roomp-timer">
            <span className="roomp-timer-label">Timer dello Studio</span>
            <div className="roomp-controls">{controls}</div>
          </div>
        </header>
      ) : (
        <header className="roomp-header">
          <div className="roomp-top">
            <h1>{group.name}</h1>
            <div className="roomp-actions">
              {seatStatus}
              {groupChips}
              {settingsButton}
            </div>
          </div>
          {/* la sala guardata e i comandi dei widget (il timer dello Studio) */}
          <div className="roomp-bar">
            {roomArrows}
            <div className="roomp-controls">{controls}</div>
          </div>
        </header>
      )}

      <div className="roomp-main">
        <section className="roomp-room" aria-label="La stanza">
          <div ref={setSceneBox} className={`roomp-scene${column ? " roomp-scene--column" : ""}`} data-pigment={pigment}>
            <RoomScene
              layout={column ? "column" : "stage"}
              scale={column ? 1 : sceneScale}
              seats={seats}
              reservedSeat={reservedSeat}
              onSit={(seat) => {
                setSeat(group.id, shown, seat);
                sitDown();
              }}
              pixies={pixyMembers[group.id] ?? {}}
              offsetMs={offsetMs}
              serverNow={serverNow}
              localNow={localNow}
              selectedId={selectedId}
              onSelect={toggle}
            />
          </div>
        </section>

        <RoomSidePanel
          key={group.id}
          groupId={group.id}
          meId={userId}
          sheet={column}
          sections={sections}
          members={byId}
          selectedId={selectedId}
          onToggle={toggle}
          serverNow={serverNow}
          onOpenSharing={() => {
            requestGroupsSharing();
            openWidgetDetail(GROUPS_WIDGET_ID);
          }}
        />
      </div>
    </div>
  );
}

export default RoomPage;
