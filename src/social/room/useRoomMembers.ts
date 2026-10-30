import { useMemo } from "react";
import { getActivity } from "../../core/activity/activityBus";
import { useCloud } from "../../core/cloud/useCloud";
import { useNow } from "../../core/hooks/useNow";
import { useGroups } from "../groups/useGroups";
import type { MemberKind } from "../modules/study/leaderboard";
import { buildPresence, presenceKind, unsavedStudySeconds, type StudyPresence } from "../modules/study/presence/payload";
import { useStudyPresence } from "../modules/study/presence/useStudyPresence";
import { useStudyTotals } from "../modules/study/totals/useStudyTotals";

export interface RoomMember {
  userId: string;
  username: string;
  isMe: boolean;
  joinedAt: number;
  /** Stato live dello Studio (null = offline). Il mio viene dal timer locale. */
  presence: StudyPresence | null;
  kind: MemberKind;
  /** Studio di oggi e della settimana, con la sessione in corso. */
  today: number;
  week: number;
  /** Ultima volta connesso (ora del server), se lo sappiamo. */
  lastSeen: number | null;
}

/** Siede nella stanza chi ha il timer avviato (anche in pausa); chi è connesso col timer fermo resta fuori. */
export function isInRoom(kind: MemberKind): boolean {
  return kind === "studying" || kind === "paused" || kind === "break";
}

/**
 * I membri di un gruppo con il loro stato, ricalcolati ogni secondo (i timer avanzano). Il mio stato viene dal
 * timer locale con la sala scelta, così è giusto anche se la connessione è caduta.
 */
export function useRoomMembers(groupId: string | null): { members: RoomMember[]; serverNow: number; localNow: number } {
  const { userId } = useCloud();
  const { members, lastSeen } = useGroups();
  const { members: live, serverNow, rooms } = useStudyPresence();
  const totals = useStudyTotals();
  const now = useNow(1000);

  return useMemo(() => {
    const server = serverNow();
    const local = now.getTime();
    if (!groupId) return { members: [], serverNow: server, localNow: local };
    const groupLive = live[groupId] ?? {};
    const list = (members[groupId] ?? []).map((m): RoomMember => {
      const isMe = m.userId === userId;
      const presence = isMe
        ? buildPresence(getActivity().studyTimer, {
            offsetMs: server - local,
            now: local,
            subject: getActivity().studySubjectName,
            room: rooms[groupId] ?? null,
          })
        : (groupLive[m.userId] ?? null);
      const running = presence ? unsavedStudySeconds(presence, server) : 0;
      return {
        userId: m.userId,
        username: m.username,
        isMe,
        joinedAt: m.joinedAt,
        presence,
        kind: presence ? presenceKind(presence) : "offline",
        today: (totals.today[m.userId] ?? 0) + running,
        week: (totals.week[m.userId] ?? 0) + running,
        lastSeen: isMe ? server : (lastSeen[m.userId] ?? null),
      };
    });
    return { members: list, serverNow: server, localNow: local };
  }, [groupId, userId, members, lastSeen, live, serverNow, rooms, totals, now]);
}
