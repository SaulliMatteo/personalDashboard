import { getMeta, setMeta } from "../../../core/db";

/* Scelte locali sui gruppi (non vanno sul server). Per account: un altro account su questo computer ha le sue. */

function selectedKey(userId: string): string {
  return `groups_selected:${userId}`;
}

/** Il gruppo mostrato da widget e stanza comune l'ultima volta. */
export async function loadSelectedGroup(userId: string): Promise<string | null> {
  return getMeta(selectedKey(userId));
}

export async function saveSelectedGroup(userId: string, groupId: string): Promise<void> {
  await setMeta(selectedKey(userId), groupId);
}
