import { requireCloudClient } from "./client";
import { throwIfFailed } from "./errors";
import { normalizeInviteCode } from "./inviteCode";

/*
 * Gruppi dell'utente (tabelle e RPC del nucleo). Le RLS restituiscono solo i gruppi di cui si è membri; ogni
 * modifica passa da una funzione del server che controlla chi la chiede (es. solo il proprietario rimuove).
 */

export const GROUP_NAME_MAX = 40;
export const GROUP_DESCRIPTION_MAX = 200;

export interface CloudGroup {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  /** Leggibile solo dai membri (RLS sulla tabella groups). */
  inviteCode: string;
  maxMembers: number;
  /** Moduli attivi (es. "study"). */
  features: string[];
}

export interface CloudGroupMember {
  groupId: string;
  userId: string;
  username: string;
  role: "owner" | "member";
  /** ms; il più vecchio eredita la proprietà se il proprietario esce. */
  joinedAt: number;
}

/** Esiti di join_group: il server restituisce uno stato invece di un errore (vedi la migrazione). */
export type JoinGroupResult = "ok" | "invalid" | "full" | "rate_limited" | "already_member";

const JOIN_RESULTS: readonly JoinGroupResult[] = ["ok", "invalid", "full", "rate_limited", "already_member"];

interface GroupRow {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  invite_code: string;
  max_members: number;
  group_features: { feature_key: string; enabled: boolean }[] | null;
}

interface MemberRow {
  group_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { username: string } | null;
}

/** I propri gruppi, in ordine di nome. */
export async function fetchMyGroups(): Promise<CloudGroup[]> {
  const result = await requireCloudClient()
    .from("groups")
    .select("id, name, description, owner_id, invite_code, max_members, group_features (feature_key, enabled)")
    .order("name");
  throwIfFailed(result);
  return ((result.data ?? []) as unknown as GroupRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    ownerId: r.owner_id,
    inviteCode: r.invite_code,
    maxMembers: r.max_members,
    features: (r.group_features ?? []).filter((f) => f.enabled).map((f) => f.feature_key),
  }));
}

/** Membri dei gruppi indicati, dal più vecchio. Il nome è quello scelto nell'app (mai il nome di Google). */
export async function fetchGroupMembers(groupIds: string[]): Promise<CloudGroupMember[]> {
  if (groupIds.length === 0) return [];
  const result = await requireCloudClient()
    .from("group_members")
    .select("group_id, user_id, role, joined_at, profiles (username)")
    .in("group_id", groupIds)
    .order("joined_at");
  throwIfFailed(result);
  return ((result.data ?? []) as unknown as MemberRow[]).map((r) => ({
    groupId: r.group_id,
    userId: r.user_id,
    username: r.profiles?.username ?? "",
    role: r.role === "owner" ? "owner" : "member",
    joinedAt: Date.parse(r.joined_at),
  }));
}

/** Crea un gruppo (se ne diventa proprietari); restituisce il suo id. */
export async function createGroup(name: string, description: string): Promise<string> {
  const result = await requireCloudClient().rpc("create_group", { p_name: name, p_description: description });
  throwIfFailed(result);
  return result.data as string;
}

export async function joinGroup(code: string): Promise<JoinGroupResult> {
  const result = await requireCloudClient().rpc("join_group", { p_code: normalizeInviteCode(code) });
  throwIfFailed(result);
  const status = result.data as JoinGroupResult;
  return JOIN_RESULTS.includes(status) ? status : "invalid";
}

/** Esce dal gruppo. Se era il proprietario, lo diventa il membro entrato per primo; vuoto, il gruppo sparisce. */
export async function leaveGroup(groupId: string): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("leave_group", { p_group_id: groupId }));
}

/** Solo il proprietario. */
export async function removeMember(groupId: string, userId: string): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("remove_member", { p_group_id: groupId, p_user_id: userId }));
}

/** Solo il proprietario: il vecchio codice smette subito di funzionare. */
export async function regenerateInviteCode(groupId: string): Promise<string> {
  const result = await requireCloudClient().rpc("regenerate_invite_code", { p_group_id: groupId });
  throwIfFailed(result);
  return result.data as string;
}

/** Solo il proprietario. */
export async function updateGroup(groupId: string, name: string, description: string): Promise<void> {
  throwIfFailed(
    await requireCloudClient().rpc("update_group", { p_group_id: groupId, p_name: name, p_description: description })
  );
}
