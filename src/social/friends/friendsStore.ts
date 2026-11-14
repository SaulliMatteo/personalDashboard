import { directMessageFromRow, type DirectMessage, type DirectRead, type FriendProfile, type FriendRequest } from "../../core/cloud/friendsApi";
import { INVITE_CODE_LENGTH, normalizeInviteCode } from "../../core/cloud/inviteCode";

/*
 * Amici e chat salvate (docs/mockup/gruppi/amici-notifiche.html, viste 3, 6, 7 e 9): la parte pura. Niente rete né
 * orologio: l'ora arriva da fuori (lo prova scripts/gruppi/friends.test.mts).
 */

/** Lunghezza massima di un messaggio di testo (come il vincolo del server). */
export const DM_TEXT_MAX = 500;
/** "In linea" se si è collegato da meno di così: il "visto" si aggiorna ogni 5 minuti (CloudContext). */
export const ONLINE_MS = 6 * 60_000;
/** Due messaggi dello stesso autore più vicini di così stanno attaccati (niente spazio in più). */
export const GROUP_GAP_MS = 5 * 60_000;

const DAY_MS = 86_400_000;

export interface FriendsData {
  friends: FriendProfile[];
  requests: FriendRequest[];
  /** Dal più vecchio, con tutti gli amici. */
  messages: DirectMessage[];
  reads: DirectRead[];
}

export const EMPTY_FRIENDS: FriendsData = { friends: [], requests: [], messages: [], reads: [] };

/* ---------- Casella in tempo reale ---------- */

export type InboxEvent =
  | { t: "dm"; message: DirectMessage }
  /** `by` ha letto la chat con `friend` (se manca: con me) fino a `until`. */
  | { t: "read"; by: string; friend: string | null; until: number }
  | { t: "request"; from: string }
  | { t: "accepted"; by: string }
  /** Elenco degli amici o delle richieste cambiato: si rilegge. */
  | { t: "friends" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const USER_RE = /^[0-9a-fA-F-]{8,64}$/;
const isUser = (v: unknown): v is string => typeof v === "string" && USER_RE.test(v);

/** Un evento della casella, controllato; null se non è valido o non lo conosciamo. */
export function parseInboxEvent(raw: unknown): InboxEvent | null {
  if (!isRecord(raw)) return null;
  switch (raw.t) {
    case "dm": {
      const message = directMessageFromRow(raw.message);
      return message ? { t: "dm", message } : null;
    }
    case "read": {
      const until = typeof raw.until === "string" ? Date.parse(raw.until) : Number.NaN;
      if (!isUser(raw.by) || !Number.isFinite(until)) return null;
      if (raw.friend !== undefined && !isUser(raw.friend)) return null;
      return { t: "read", by: raw.by, friend: isUser(raw.friend) ? raw.friend : null, until };
    }
    case "request":
      return isUser(raw.from) ? { t: "request", from: raw.from } : null;
    case "accepted":
      return isUser(raw.by) ? { t: "accepted", by: raw.by } : null;
    case "friends":
      return { t: "friends" };
    default:
      return null;
  }
}

/* ---------- Messaggi e letture ---------- */

function compareMessages(a: DirectMessage, b: DirectMessage): number {
  return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Aggiunge o sostituisce (stesso id: es. eliminato) un messaggio, tenendo l'ordine. */
export function upsertMessage(messages: readonly DirectMessage[], message: DirectMessage): DirectMessage[] {
  const next = messages.filter((m) => m.id !== message.id);
  next.push(message);
  return next.sort(compareMessages);
}

/** Una lettura: si va solo avanti. */
export function applyRead(reads: readonly DirectRead[], read: DirectRead): DirectRead[] {
  const old = reads.find((r) => r.userId === read.userId && r.friendId === read.friendId);
  if (old && old.readUntil >= read.readUntil) return reads as DirectRead[];
  return [...reads.filter((r) => r !== old), read];
}

/** Fin dove `userId` ha letto la chat con `friendId` (0 = mai). */
export function readUntilOf(reads: readonly DirectRead[], userId: string, friendId: string): number {
  return reads.find((r) => r.userId === userId && r.friendId === friendId)?.readUntil ?? 0;
}

/** La chat tra me e un amico, dal più vecchio. */
export function conversation(messages: readonly DirectMessage[], me: string, friendId: string): DirectMessage[] {
  return messages.filter(
    (m) => (m.sender === me && m.recipient === friendId) || (m.sender === friendId && m.recipient === me)
  );
}

/** Messaggi dell'amico arrivati dopo la mia ultima lettura (gli eliminati non contano). */
export function unreadFrom(messages: readonly DirectMessage[], reads: readonly DirectRead[], me: string, friendId: string): number {
  const until = readUntilOf(reads, me, friendId);
  return messages.filter((m) => m.sender === friendId && m.recipient === me && !m.deleted && m.createdAt > until).length;
}

/** L'istante dell'ultimo messaggio ricevuto da un amico (null se nessuno): fin lì si segna letto. */
export function lastIncomingAt(messages: readonly DirectMessage[], me: string, friendId: string): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender === friendId && m.recipient === me) return m.createdAt;
  }
  return null;
}

/** ✓✓: l'amico ha letto questo mio messaggio. */
export function isReadByFriend(message: DirectMessage, reads: readonly DirectRead[]): boolean {
  return message.createdAt <= readUntilOf(reads, message.recipient, message.sender);
}

/** Il messaggio continua quello prima: stesso autore, a pochi minuti, nessuno dei due eliminato (niente spazio). */
export function continuesPrevious(messages: readonly DirectMessage[], index: number): boolean {
  const prev = messages[index - 1];
  const m = messages[index];
  return !!prev && prev.sender === m.sender && m.createdAt - prev.createdAt < GROUP_GAP_MS && sameDay(prev.createdAt, m.createdAt);
}

/* ---------- Elenco degli amici ---------- */

export interface FriendRow {
  friend: FriendProfile;
  last: DirectMessage | null;
  unread: number;
}

/** Gli amici con l'ultimo messaggio e i non letti, prima chi ha scritto per ultimo (poi gli amici più recenti). */
export function friendRows(data: FriendsData, me: string): FriendRow[] {
  const rows = data.friends.map((friend) => {
    const chat = conversation(data.messages, me, friend.userId);
    return { friend, last: chat[chat.length - 1] ?? null, unread: unreadFrom(data.messages, data.reads, me, friend.userId) };
  });
  const at = (r: FriendRow) => r.last?.createdAt ?? r.friend.since;
  return rows.sort((a, b) => at(b) - at(a) || a.friend.username.localeCompare(b.friend.username, "it"));
}

/** Ricerca per nome, senza badare a maiuscole e accenti. */
export function filterFriendRows(rows: readonly FriendRow[], query: string): FriendRow[] {
  const q = fold(query.trim());
  return q ? rows.filter((r) => fold(r.friend.username).includes(q)) : [...rows];
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Non letti con tutti, più le richieste ricevute: il pallino sull'icona degli amici. */
export function attentionCount(data: FriendsData, me: string): number {
  const unread = data.friends.reduce((n, f) => n + unreadFrom(data.messages, data.reads, me, f.userId), 0);
  return unread + data.requests.filter((r) => r.direction === "in").length;
}

/**
 * Come si descrive un messaggio nell'elenco e nelle notifiche. `describeCard` lo danno le azioni dei widget
 * (es. "🎬 Video: titolo"); senza, una scheda è "Contenuto".
 */
export function previewText(
  message: DirectMessage,
  me: string,
  describeCard: (kind: string, payload: unknown) => string | null = () => null
): string {
  const mine = message.sender === me ? "Tu: " : "";
  if (message.deleted) return `${mine}Messaggio eliminato`;
  if (message.kind === "text") return `${mine}${message.body}`;
  return `${mine}${describeCard(message.kind, message.payload) ?? "📎 Contenuto"}`;
}

/* ---------- Tempo ---------- */

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const ddmm = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

function startOfDay(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Giorni di calendario tra due istanti (regge il cambio dell'ora). */
function daysBetween(at: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
}

const WEEKDAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

/** L'ora nell'elenco: "16:42" oggi, "ieri", il giorno della settimana fino a 6 giorni fa, poi "12/10". */
export function listTime(at: number, now: number): string {
  const days = daysBetween(at, now);
  if (days <= 0) return hhmm(at);
  if (days === 1) return "ieri";
  if (days < 7) return WEEKDAYS[new Date(at).getDay()];
  return ddmm(at);
}

export function isOnline(lastSeenAt: number | null, now: number): boolean {
  return lastSeenAt !== null && now - lastSeenAt < ONLINE_MS;
}

/** Sotto il nome nella chat: "in linea", "visto alle 15:10", "visto ieri alle 21:04", "visto il 12/10". */
export function seenText(lastSeenAt: number | null, now: number): string {
  if (lastSeenAt === null) return "non si è ancora visto";
  if (isOnline(lastSeenAt, now)) return "in linea";
  const days = daysBetween(lastSeenAt, now);
  if (days <= 0) return `visto alle ${hhmm(lastSeenAt)}`;
  if (days === 1) return `visto ieri alle ${hhmm(lastSeenAt)}`;
  return `visto il ${ddmm(lastSeenAt)}`;
}

/** Ora di un messaggio nella chat. */
export function messageTime(at: number): string {
  return hhmm(at);
}

/* ---------- Codice e link ---------- */

const LINK_PREFIX = "personaldashboard://amici/";

/** Il link da mandare a qualcuno: apre l'app con la richiesta pronta. */
export function friendLink(code: string): string {
  return `${LINK_PREFIX}${normalizeInviteCode(code)}`;
}

/** Il codice contenuto in un link degli amici (null se il link è un altro o il codice non ha la forma giusta). */
export function parseFriendLink(url: string): string | null {
  if (!url.toLowerCase().startsWith(LINK_PREFIX)) return null;
  const code = normalizeInviteCode(decodeURIComponent(url.slice(LINK_PREFIX.length).split(/[/?#]/)[0] ?? ""));
  return code.length === INVITE_CODE_LENGTH && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/.test(code) ? code : null;
}

/** Frase per l'esito di una richiesta d'amicizia. */
export function requestResultText(result: string): string {
  switch (result) {
    case "sent":
      return "Richiesta inviata: diventate amici quando la accetta.";
    case "accepted":
      return "Ora siete amici: ti aveva già mandato una richiesta.";
    case "self":
      return "Questo è il tuo codice.";
    case "already_friends":
      return "Siete già amici.";
    case "already_sent":
      return "Gli hai già mandato una richiesta.";
    case "too_many":
      return "Hai troppe richieste in attesa: annullane qualcuna.";
    case "rate_limited":
      return "Troppi tentativi. Riprova tra un'ora.";
    default:
      return "Codice non valido o non più attivo.";
  }
}

/* ---------- Faccina ---------- */

export type AvatarTint = "salvia" | "blu" | "senape" | "malva";
const TINTS: readonly AvatarTint[] = ["salvia", "blu", "senape", "malva"];

/** Il colore della faccina di un amico: fisso per ogni utente, dalle tinte del tema (i profili non hanno foto). */
export function avatarTint(userId: string): AvatarTint {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}
