import { useActivityStatus } from "../../core/activity/activityBus";
import { useCloud } from "../../core/cloud/useCloud";
import { useNav } from "../../core/nav/useNav";
import { useGroupsState } from "../groups/groupsState";
import { useGroups } from "../groups/useGroups";
import { presenceKind } from "../modules/study/presence/payload";
import { useStudyPresence } from "../modules/study/presence/useStudyPresence";
import "./RoomNavItem.css";

/**
 * La voce "Stanza comune" della barra laterale, con quanti studiano adesso nel gruppo scelto. Non c'è se i
 * Gruppi non sono configurati in questa build (app solo locale).
 */
function RoomNavItem() {
  const { view, openRoom } = useNav();
  const state = useGroupsState();
  const { userId } = useCloud();
  const { selectedGroup } = useGroups();
  const { members } = useStudyPresence();
  const { studying: meStudying } = useActivityStatus();
  if (state === "unconfigured" || state === "unavailable") return null;

  const live = (state === "ok" && selectedGroup ? members[selectedGroup.id] : undefined) ?? {};
  let count = 0;
  for (const [id, presence] of Object.entries(live)) if (id !== userId && presenceKind(presence) === "studying") count++;
  if (state === "ok" && selectedGroup && meStudying) count++;

  const active = view.type === "room";
  return (
    <button
      type="button"
      className={`nav-item room-nav-item${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={openRoom}
    >
      <span className="nav-item-dot" aria-hidden="true" />
      <span className="room-nav-label">Stanza comune</span>
      {count > 0 && (
        <span className="room-nav-badge" aria-label={`${count} ${count === 1 ? "sta studiando" : "stanno studiando"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export default RoomNavItem;
