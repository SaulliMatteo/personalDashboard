import { getMeta, setMeta } from "../../../../core/db";

/*
 * L'ultimo "ha studiato N ore" annunciato da questo computer, per non ripeterlo dopo un riavvio. Sta nei metadati
 * dell'app (core/db/meta.ts), per account.
 */

const key = (userId: string) => `groups_chat_studied:${userId}`;

export function loadLastMilestone(userId: string): Promise<string | null> {
  return getMeta(key(userId));
}

export function saveLastMilestone(userId: string, day: string, hours: number): Promise<void> {
  return setMeta(key(userId), `${day}:${hours}`);
}
