import { useMemo } from "react";
import { getActivity } from "../../../core/activity/activityBus";
import { useCloud } from "../../../core/cloud/useCloud";
import { useNow } from "../../../core/hooks/useNow";
import { useGroups } from "../../groups/useGroups";
import { buildLeaderboard, type LeaderboardPeriod, type LeaderboardRow } from "./leaderboard";
import { buildPresence, type StudyPresence } from "./presence/payload";
import { useStudyPresence } from "./presence/useStudyPresence";
import { useStudyTotals } from "./totals/useStudyTotals";

/**
 * La classifica live di un gruppo, ricalcolata ogni secondo (i timer in corso avanzano). Il mio stato viene dal
 * timer locale, non dal canale: è giusto anche mentre la connessione è caduta.
 */
export function useLeaderboard(groupId: string | null, period: LeaderboardPeriod): LeaderboardRow[] {
  const { userId } = useCloud();
  const { members } = useGroups();
  const { members: live, serverNow } = useStudyPresence();
  const totals = useStudyTotals();
  const now = useNow(1000);

  return useMemo(() => {
    if (!groupId) return [];
    const local = now.getTime();
    const server = serverNow();
    const groupLive: Record<string, StudyPresence> = { ...(live[groupId] ?? {}) };
    if (userId) {
      groupLive[userId] = buildPresence(getActivity().studyTimer, {
        offsetMs: server - local,
        now: local,
        subject: null,
        room: null,
      });
    }
    return buildLeaderboard({
      members: (members[groupId] ?? []).map((m) => ({ userId: m.userId, username: m.username })),
      meId: userId,
      saved: period === "today" ? totals.today : totals.week,
      live: groupLive,
      serverNow: server,
    });
  }, [groupId, period, userId, members, live, serverNow, totals, now]);
}
