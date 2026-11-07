/*
 * Prove degli amici (src/social/friends/friendsStore.ts): eventi della casella, messaggi e letture, non letti, elenco,
 * ricerca, tempi, link e faccina. Funzioni pure. Lancio (dalla cartella del repo):
 *   npx rolldown scripts/gruppi/friends.test.mts --file node_modules/.tmp/gruppi-friends.test.mjs --platform node
 *   node node_modules/.tmp/gruppi-friends.test.mjs
 */
import assert from "node:assert/strict";
import type { DirectMessage, FriendProfile } from "../../src/core/cloud/friendsApi";
import {
  EMPTY_FRIENDS,
  applyRead,
  attentionCount,
  avatarTint,
  continuesPrevious,
  conversation,
  filterFriendRows,
  friendLink,
  friendRows,
  isOnline,
  isReadByFriend,
  lastIncomingAt,
  listTime,
  parseFriendLink,
  parseInboxEvent,
  previewText,
  seenText,
  unreadFrom,
  upsertMessage,
  type FriendsData,
} from "../../src/social/friends/friendsStore";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error(`FALLITO: ${name}`);
    throw error;
  }
}

const ME = "11111111-1111-1111-1111-111111111111";
const ANNA = "22222222-2222-2222-2222-222222222222";
const BRUNO = "33333333-3333-3333-3333-333333333333";
const MIN = 60_000;
// 7 novembre 2026 alle 15:00, ora locale
const NOW = new Date(2026, 10, 7, 15, 0).getTime();

function msg(id: string, sender: string, recipient: string, at: number, extra: Partial<DirectMessage> = {}): DirectMessage {
  return { id, sender, recipient, kind: "text", body: id, payload: null, createdAt: at, deleted: false, ...extra };
}
function friend(userId: string, username: string, since = NOW - 100 * MIN): FriendProfile {
  return { userId, username, lastSeenAt: null, since };
}
const row = (id: string, sender: string, recipient: string, iso: string) => ({
  id,
  sender,
  recipient,
  kind: "text",
  body: "ciao",
  payload: null,
  created_at: iso,
  deleted: false,
});

test("casella: messaggio valido, campi sbagliati scartati", () => {
  const ok = parseInboxEvent({ t: "dm", message: row("m1", ANNA, ME, "2026-11-07T14:00:00Z") });
  assert.equal(ok?.t, "dm");
  assert.equal(ok?.t === "dm" && ok.message.createdAt, Date.parse("2026-11-07T14:00:00Z"));
  assert.equal(parseInboxEvent({ t: "dm", message: { ...row("m1", ANNA, ME, "x"), created_at: "non una data" } }), null);
  assert.equal(parseInboxEvent({ t: "dm", message: { id: 3 } }), null);
  assert.equal(parseInboxEvent({ t: "boh" }), null);
  assert.equal(parseInboxEvent(null), null);
  assert.equal(parseInboxEvent([]), null);
});

test("casella: letture, richieste, amicizie", () => {
  assert.deepEqual(parseInboxEvent({ t: "read", by: ANNA, until: "2026-11-07T14:00:00Z" }), {
    t: "read",
    by: ANNA,
    friend: null,
    until: Date.parse("2026-11-07T14:00:00Z"),
  });
  assert.equal(parseInboxEvent({ t: "read", by: ME, friend: ANNA, until: "2026-11-07T14:00:00Z" })?.t, "read");
  assert.equal(parseInboxEvent({ t: "read", by: "x", until: "2026-11-07T14:00:00Z" }), null);
  assert.equal(parseInboxEvent({ t: "read", by: ANNA, friend: 5, until: "2026-11-07T14:00:00Z" }), null);
  assert.deepEqual(parseInboxEvent({ t: "request", from: BRUNO }), { t: "request", from: BRUNO });
  assert.equal(parseInboxEvent({ t: "request" }), null);
  assert.deepEqual(parseInboxEvent({ t: "accepted", by: BRUNO }), { t: "accepted", by: BRUNO });
  assert.deepEqual(parseInboxEvent({ t: "friends", extra: 1 }), { t: "friends" });
});

test("messaggi: in ordine, lo stesso id si sostituisce (eliminato)", () => {
  let list = upsertMessage([], msg("b", ME, ANNA, NOW));
  list = upsertMessage(list, msg("a", ANNA, ME, NOW - MIN));
  list = upsertMessage(list, msg("c", ANNA, ME, NOW));
  assert.deepEqual(list.map((m) => m.id), ["a", "b", "c"]);
  list = upsertMessage(list, msg("b", ME, ANNA, NOW, { deleted: true, body: "" }));
  assert.equal(list.length, 3);
  assert.ok(list[1].deleted);
});

test("letture: si va solo avanti", () => {
  let reads = applyRead([], { userId: ME, friendId: ANNA, readUntil: NOW });
  reads = applyRead(reads, { userId: ME, friendId: ANNA, readUntil: NOW - MIN });
  assert.equal(reads.length, 1);
  assert.equal(reads[0].readUntil, NOW);
  reads = applyRead(reads, { userId: ME, friendId: ANNA, readUntil: NOW + MIN });
  assert.equal(reads[0].readUntil, NOW + MIN);
});

test("non letti, ultima ricevuta e ✓✓", () => {
  const messages = [
    msg("1", ANNA, ME, NOW - 10 * MIN),
    msg("2", ME, ANNA, NOW - 9 * MIN),
    msg("3", ANNA, ME, NOW - 5 * MIN),
    msg("4", ANNA, ME, NOW - 4 * MIN, { deleted: true }),
    msg("5", BRUNO, ME, NOW - 3 * MIN),
  ];
  const reads = [
    { userId: ME, friendId: ANNA, readUntil: NOW - 8 * MIN },
    { userId: ANNA, friendId: ME, readUntil: NOW - 9 * MIN },
  ];
  assert.equal(unreadFrom(messages, reads, ME, ANNA), 1, "il 3; l'eliminato non conta");
  assert.equal(unreadFrom(messages, reads, ME, BRUNO), 1);
  assert.equal(lastIncomingAt(messages, ME, ANNA), NOW - 4 * MIN);
  assert.equal(lastIncomingAt(messages, ME, "44444444-4444-4444-4444-444444444444"), null);
  assert.ok(isReadByFriend(messages[1], reads), "anna ha letto fino al mio");
  assert.ok(!isReadByFriend(msg("6", ME, ANNA, NOW), reads));
  assert.deepEqual(conversation(messages, ME, ANNA).map((m) => m.id), ["1", "2", "3", "4"]);
});

test("messaggi attaccati: stesso autore a pochi minuti, lo stesso giorno", () => {
  const list = [
    msg("1", ANNA, ME, NOW - 10 * MIN),
    msg("2", ANNA, ME, NOW - 9 * MIN),
    msg("3", ME, ANNA, NOW - 8 * MIN),
    msg("4", ME, ANNA, NOW),
  ];
  assert.equal(continuesPrevious(list, 0), false);
  assert.equal(continuesPrevious(list, 1), true);
  assert.equal(continuesPrevious(list, 2), false, "cambia autore");
  assert.equal(continuesPrevious(list, 3), false, "8 minuti dopo");
  const midnight = new Date(2026, 10, 7, 0, 0).getTime();
  assert.equal(continuesPrevious([msg("a", ANNA, ME, midnight - MIN), msg("b", ANNA, ME, midnight + MIN)], 1), false);
});

test("elenco: prima chi ha scritto per ultimo, ricerca senza accenti", () => {
  const data: FriendsData = {
    ...EMPTY_FRIENDS,
    friends: [friend(ANNA, "Anna"), friend(BRUNO, "Bruno Città", NOW - 2 * MIN)],
    messages: [msg("1", ANNA, ME, NOW - 30 * MIN), msg("2", ANNA, ME, NOW - 20 * MIN)],
    requests: [{ userId: "55555555-5555-5555-5555-555555555555", username: "x", direction: "in", createdAt: NOW }],
  };
  const rows = friendRows(data, ME);
  assert.deepEqual(rows.map((r) => r.friend.username), ["Bruno Città", "Anna"], "bruno amico da 2 minuti, anna 20 minuti fa");
  assert.equal(rows[1].unread, 2);
  assert.equal(rows[1].last?.id, "2");
  assert.deepEqual(filterFriendRows(rows, " citta ").map((r) => r.friend.userId), [BRUNO]);
  assert.equal(filterFriendRows(rows, "").length, 2);
  assert.equal(attentionCount(data, ME), 3, "2 non letti + 1 richiesta ricevuta");
});

test("anteprima: mio, eliminato, scheda", () => {
  assert.equal(previewText(msg("ciao", ME, ANNA, NOW), ME), "Tu: ciao");
  assert.equal(previewText(msg("x", ANNA, ME, NOW, { deleted: true }), ME), "Messaggio eliminato");
  assert.equal(previewText(msg("x", ANNA, ME, NOW, { kind: "youtube" }), ME), "📎 Contenuto");
  assert.equal(
    previewText(msg("x", ANNA, ME, NOW, { kind: "youtube" }), ME, (kind) => (kind === "youtube" ? "🎬 Video" : null)),
    "🎬 Video"
  );
});

test("tempi: elenco e visto", () => {
  assert.equal(listTime(new Date(2026, 10, 7, 9, 5).getTime(), NOW), "09:05");
  assert.equal(listTime(new Date(2026, 10, 6, 23, 0).getTime(), NOW), "ieri");
  assert.equal(listTime(new Date(2026, 10, 2, 12, 0).getTime(), NOW), "lun");
  assert.equal(listTime(new Date(2026, 9, 12, 12, 0).getTime(), NOW), "12/10");
  assert.ok(isOnline(NOW - 5 * MIN, NOW));
  assert.ok(!isOnline(NOW - 7 * MIN, NOW));
  assert.ok(!isOnline(null, NOW));
  assert.equal(seenText(NOW - MIN, NOW), "in linea");
  assert.equal(seenText(new Date(2026, 10, 7, 13, 10).getTime(), NOW), "visto alle 13:10");
  assert.equal(seenText(new Date(2026, 10, 6, 21, 4).getTime(), NOW), "visto ieri alle 21:04");
  assert.equal(seenText(new Date(2026, 9, 12, 8, 0).getTime(), NOW), "visto il 12/10");
});

test("link: andata e ritorno, link estranei scartati", () => {
  assert.equal(friendLink("k7pq-m2xd"), "personaldashboard://amici/K7PQM2XD");
  assert.equal(parseFriendLink("personaldashboard://amici/K7PQM2XD"), "K7PQM2XD");
  assert.equal(parseFriendLink("personaldashboard://amici/k7pq-m2xd/"), "K7PQM2XD");
  assert.equal(parseFriendLink("PersonalDashboard://amici/K7PQM2XD?x=1"), "K7PQM2XD");
  assert.equal(parseFriendLink("personaldashboard://auth/callback?code=abc"), null);
  assert.equal(parseFriendLink("personaldashboard://amici/K7PQ"), null, "troppo corto");
  assert.equal(parseFriendLink("personaldashboard://amici/K7PQM2X0"), null, "0 non è nell'alfabeto");
  assert.equal(parseFriendLink("https://amici/K7PQM2XD"), null);
});

test("faccina: sempre lo stesso colore per lo stesso utente", () => {
  assert.equal(avatarTint(ANNA), avatarTint(ANNA));
  const tints = new Set([ME, ANNA, BRUNO, "a", "b", "c", "d", "e"].map(avatarTint));
  assert.ok(tints.size > 1);
  for (const t of tints) assert.ok(["salvia", "blu", "senape", "malva"].includes(t));
});

console.log(`friends: ${passed} prove passate`);
