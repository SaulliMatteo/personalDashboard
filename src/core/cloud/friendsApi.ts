import type { RealtimeChannel } from "@supabase/supabase-js";
import { requireCloudClient } from "./client";
import { throwIfFailed } from "./errors";
import { normalizeInviteCode } from "./inviteCode";
import type { PresenceChannelStatus } from "./presence";

/*
 * Amici e messaggi diretti (supabase/migrations/…_amici.sql). A differenza della chat dei gruppi i messaggi restano
 * sul server per 90 giorni: ognuno legge solo i propri (RLS) e scrive solo con le RPC, che decidono mittente e ora.
 * Il tempo reale arriva sulla propria casella privata "inbox:<user_id>": ci scrive solo il server.
 */

export interface FriendProfile {
  userId: string;
  username: string;
  /** ms; null se non si è mai collegato (o il server non lo dice). */
  lastSeenAt: number | null;
  /** Da quando siete amici (ms). */
  since: number;
}

export interface FriendRequest {
  userId: string;
  username: string;
  /** "in": l'ha mandata l'altro a me; "out": l'ho mandata io. */
  direction: "in" | "out";
  createdAt: number;
}

export interface DirectMessage {
  id: string;
  sender: string;
  recipient: string;
  /** "text" oppure il tipo di una scheda di un widget (es. "youtube"). */
  kind: string;
  body: string;
  /** Il contenuto della scheda, non validato (lo controlla chi la disegna). */
  payload: unknown;
  createdAt: number;
  deleted: boolean;
}

export interface DirectRead {
  /** Chi ha letto… */
  userId: string;
  /** …la chat con chi… */
  friendId: string;
  /** …fino a quando (ms). */
  readUntil: number;
}

/** Esiti di request_friend (come join_group: uno stato, non un errore). */
export type FriendRequestResult =
  | "sent"
  | "accepted"
  | "invalid"
  | "self"
  | "already_friends"
  | "already_sent"
  | "too_many"
  | "rate_limited";

const REQUEST_RESULTS: readonly FriendRequestResult[] = [
  "sent",
  "accepted",
  "invalid",
  "self",
  "already_friends",
  "already_sent",
  "too_many",
  "rate_limited",
];

/** Righe lette per pagina (il limite di PostgREST è 1000). */
const PAGE = 1000;

const ms = (iso: unknown) => (typeof iso === "string" ? Date.parse(iso) : Number.NaN);

/** Una riga di direct_messages (dalla tabella o dalla casella in tempo reale); null se non ha la forma giusta. */
export function directMessageFromRow(row: unknown): DirectMessage | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const createdAt = ms(r.created_at);
  if (typeof r.id !== "string" || typeof r.sender !== "string" || typeof r.recipient !== "string") return null;
  if (typeof r.kind !== "string" || typeof r.body !== "string" || !Number.isFinite(createdAt)) return null;
  return {
    id: r.id,
    sender: r.sender,
    recipient: r.recipient,
    kind: r.kind,
    body: r.body,
    payload: r.payload ?? null,
    createdAt,
    deleted: r.deleted === true,
  };
}

async function fetchProfiles(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (userIds.length === 0) return names;
  const result = await requireCloudClient().from("profiles").select("id, username").in("id", userIds);
  throwIfFailed(result);
  for (const r of result.data ?? []) names.set(r.id as string, r.username as string);
  return names;
}

/** I propri amici, con nome e ultima connessione. */
export async function fetchFriends(myId: string): Promise<FriendProfile[]> {
  const supabase = requireCloudClient();
  const result = await supabase.from("friendships").select("user_a, user_b, created_at");
  throwIfFailed(result);
  const rows = (result.data ?? []) as { user_a: string; user_b: string; created_at: string }[];
  const ids = rows.map((r) => (r.user_a === myId ? r.user_b : r.user_a));
  const [names, seen] = await Promise.all([
    fetchProfiles(ids),
    (async () => {
      if (ids.length === 0) return new Map<string, number>();
      const r = await supabase.from("last_seen").select("user_id, seen_at").in("user_id", ids);
      throwIfFailed(r);
      return new Map((r.data ?? []).map((x) => [x.user_id as string, ms(x.seen_at)]));
    })(),
  ]);
  return rows.map((r, i) => ({
    userId: ids[i],
    username: names.get(ids[i]) ?? "",
    lastSeenAt: seen.get(ids[i]) ?? null,
    since: ms(r.created_at),
  }));
}

/** Richieste in attesa, ricevute e inviate. */
export async function fetchFriendRequests(myId: string): Promise<FriendRequest[]> {
  const result = await requireCloudClient().from("friend_requests").select("from_user, to_user, created_at").order("created_at");
  throwIfFailed(result);
  const rows = (result.data ?? []) as { from_user: string; to_user: string; created_at: string }[];
  const other = (r: (typeof rows)[number]) => (r.from_user === myId ? r.to_user : r.from_user);
  const names = await fetchProfiles(rows.map(other));
  return rows.map((r) => ({
    userId: other(r),
    username: names.get(other(r)) ?? "",
    direction: r.from_user === myId ? "out" : "in",
    createdAt: ms(r.created_at),
  }));
}

/** Tutti i messaggi leggibili (gli ultimi 90 giorni, con tutti gli amici), dal più vecchio. */
export async function fetchDirectMessages(): Promise<DirectMessage[]> {
  const supabase = requireCloudClient();
  const all: DirectMessage[] = [];
  for (let from = 0; ; from += PAGE) {
    const result = await supabase
      .from("direct_messages")
      .select("id, sender, recipient, kind, body, payload, created_at, deleted")
      .order("created_at")
      .order("id")
      .range(from, from + PAGE - 1);
    throwIfFailed(result);
    const rows = result.data ?? [];
    for (const row of rows) {
      const m = directMessageFromRow(row);
      if (m) all.push(m);
    }
    if (rows.length < PAGE) return all;
  }
}

/** Fin dove si è letto: io con ogni amico, e ogni amico con me. */
export async function fetchDirectReads(): Promise<DirectRead[]> {
  const result = await requireCloudClient().from("direct_reads").select("user_id, friend_id, read_until");
  throwIfFailed(result);
  return (result.data ?? []).map((r) => ({
    userId: r.user_id as string,
    friendId: r.friend_id as string,
    readUntil: ms(r.read_until),
  }));
}

export async function fetchMyFriendCode(): Promise<string> {
  const result = await requireCloudClient().rpc("my_friend_code");
  throwIfFailed(result);
  return result.data as string;
}

/** Il vecchio codice smette subito di funzionare. */
export async function regenerateFriendCode(): Promise<string> {
  const result = await requireCloudClient().rpc("regenerate_friend_code");
  throwIfFailed(result);
  return result.data as string;
}

export async function requestFriend(code: string): Promise<FriendRequestResult> {
  const result = await requireCloudClient().rpc("request_friend", { p_code: normalizeInviteCode(code) });
  throwIfFailed(result);
  const status = result.data as FriendRequestResult;
  return REQUEST_RESULTS.includes(status) ? status : "invalid";
}

export async function answerFriend(fromUserId: string, accept: boolean): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("answer_friend", { p_from: fromUserId, p_accept: accept }));
}

export async function cancelFriendRequest(toUserId: string): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("cancel_friend_request", { p_to: toUserId }));
}

/** Toglie l'amico: la chat sparisce per tutti e due. */
export async function removeFriend(userId: string): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("remove_friend", { p_user_id: userId }));
}

/** Manda un messaggio (testo, o una scheda con `payload`); restituisce il messaggio come l'ha salvato il server. */
export async function sendDirectMessage(to: string, kind: string, body: string, payload: unknown = null): Promise<DirectMessage> {
  const result = await requireCloudClient().rpc("send_dm", { p_to: to, p_kind: kind, p_body: body, p_payload: payload });
  throwIfFailed(result);
  const message = directMessageFromRow(result.data);
  if (!message) throw new Error("send_dm: risposta inattesa");
  return message;
}

export async function deleteDirectMessage(id: string): Promise<void> {
  throwIfFailed(await requireCloudClient().rpc("delete_dm", { p_id: id }));
}

export async function markDirectRead(friendId: string, until: number): Promise<void> {
  throwIfFailed(
    await requireCloudClient().rpc("mark_dm_read", { p_friend: friendId, p_until: new Date(until).toISOString() })
  );
}

/* ---------- Casella in tempo reale ---------- */

export function inboxTopic(userId: string): string {
  return `inbox:${userId}`;
}

export interface InboxListeners {
  /** Un evento della casella (non validato): messaggio, lettura, richiesta, amicizia cambiata. */
  event: (payload: unknown) => void;
  status: (status: PresenceChannelStatus) => void;
}

export interface InboxChannel {
  leave: () => Promise<void>;
}

/** Ascolta la propria casella. Solo ricezione: nessun client può scriverci. */
export function joinInbox(userId: string, listeners: InboxListeners): InboxChannel {
  const supabase = requireCloudClient();
  const channel: RealtimeChannel = supabase.channel(inboxTopic(userId), { config: { private: true } });
  let left = false;
  channel.on("broadcast", { event: "m" }, (message: { payload?: unknown }) => {
    if (!left) listeners.event(message.payload);
  });
  channel.subscribe((status) => {
    if (left) return;
    if (status === "SUBSCRIBED") listeners.status("joined");
    else if (status === "CLOSED") listeners.status("closed");
    else listeners.status("error");
  });
  return {
    leave: async () => {
      left = true;
      await supabase.removeChannel(channel);
    },
  };
}
