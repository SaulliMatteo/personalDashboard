/*
 * Prove della Stanza comune: sale e posti, testi (funzioni pure, nessun server).
 * Lancio (da questa cartella del repo):
 *   npx rolldown scripts/gruppi/room.test.mts --file node_modules/.tmp/gruppi-room.test.mjs --platform node
 *   node node_modules/.tmp/gruppi-room.test.mjs
 */
import assert from "node:assert/strict";
import { assignRooms, placeSeats, roomOf, SEAT_SLOTS, seatOrder, type SeatCandidate } from "../../src/social/room/seating";
import { formatClock, lastSeenText, roomInfo, roomSubtitle } from "../../src/social/room/roomText";

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

const OPTS = { seats: 8, maxRooms: 4 };
const people = (n: number, room: (i: number) => number | null = () => null): SeatCandidate[] =>
  Array.from({ length: n }, (_, i) => ({ userId: `u${String(i).padStart(2, "0")}`, joinedAt: 1000 + i, room: room(i) }));

test("nessuno presente: una sala vuota", () => {
  assert.deepEqual(assignRooms([], OPTS), [[]]);
});

test("riempimento automatico in ordine di ingresso nel gruppo", () => {
  const rooms = assignRooms(people(10), OPTS);
  assert.equal(rooms.length, 2);
  assert.deepEqual(rooms[0], ["u00", "u01", "u02", "u03", "u04", "u05", "u06", "u07"]);
  assert.deepEqual(rooms[1], ["u08", "u09"]);
});

test("stesso risultato qualunque sia l'ordine in cui arrivano i dati", () => {
  const list = people(12, (i) => (i % 5 === 0 ? 1 : null));
  const a = assignRooms(list, OPTS);
  const b = assignRooms([...list].reverse(), OPTS);
  assert.deepEqual(a, b);
});

test("a pari ingresso decide l'id", () => {
  const rooms = assignRooms(
    [
      { userId: "b", joinedAt: 5, room: null },
      { userId: "a", joinedAt: 5, room: null },
    ],
    OPTS
  );
  assert.deepEqual(rooms, [["a", "b"]]);
});

test("chi sceglie una sala ci si siede, anche se la prima ha posto", () => {
  const rooms = assignRooms(people(3, (i) => (i === 2 ? 2 : null)), OPTS);
  assert.equal(rooms.length, 3, "esiste la sala scelta, anche con quella in mezzo vuota");
  assert.deepEqual(rooms[0], ["u00", "u01"]);
  assert.deepEqual(rooms[1], []);
  assert.deepEqual(rooms[2], ["u02"]);
  assert.equal(roomOf(rooms, "u02"), 2);
  assert.equal(roomOf(rooms, "nessuno"), -1);
});

test("sala scelta piena: chi è entrato dopo va nel riempimento automatico", () => {
  const rooms = assignRooms(people(10, () => 0), OPTS);
  assert.deepEqual(rooms[0], ["u00", "u01", "u02", "u03", "u04", "u05", "u06", "u07"]);
  assert.deepEqual(rooms[1], ["u08", "u09"]);
});

test("i posti scelti vengono prima di quelli automatici", () => {
  // u00..u06 automatici, u07 e u08 scelgono la sala 0: si siedono loro, gli ultimi automatici scalano
  const rooms = assignRooms(people(9, (i) => (i >= 7 ? 0 : null)), OPTS);
  assert.deepEqual(rooms[0], ["u00", "u01", "u02", "u03", "u04", "u05", "u07", "u08"]);
  assert.deepEqual(rooms[1], ["u06"]);
});

test("una sala scelta fuori dai limiti vale come automatica", () => {
  const rooms = assignRooms(people(2, (i) => (i === 1 ? 9 : null)), OPTS);
  assert.deepEqual(rooms, [["u00", "u01"]]);
});

test("30 membri stanno tutti seduti in 4 sale", () => {
  const rooms = assignRooms(people(30), OPTS);
  assert.equal(rooms.length, 4);
  assert.equal(rooms.flat().length, 30);
  assert.ok(rooms.every((r) => r.length <= 8));
});

test("ordine dei posti: prima io, poi chi studia, poi gli altri", () => {
  const studying = new Set(["c", "e"]);
  assert.deepEqual(seatOrder(["a", "b", "c", "d", "e"], "d", (id) => studying.has(id)), ["d", "c", "e", "a", "b"]);
  assert.deepEqual(seatOrder(["a", "b"], null, () => false), ["a", "b"]);
});

test("posizioni della scena: le 8 posizioni, i primi posti davanti al centro", () => {
  assert.deepEqual([...SEAT_SLOTS].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
  // la fila davanti sono le posizioni 4..7: il posto 0 (io) è al tavolo destro, a sinistra
  assert.equal(SEAT_SLOTS.indexOf(0), 6);
  assert.equal(SEAT_SLOTS.indexOf(1), 5);
});

test("posti scelti: chi li sceglie ci si siede, gli altri riempiono i rimasti davanti al centro", () => {
  const room = ["a", "b", "c"];
  const places = placeSeats(room, (id) => (id === "b" ? 0 : null), ["c", "a", "b"]);
  assert.equal(places.length, 8);
  assert.equal(places[0], "b");
  // automatici nell'ordine di autoOrder, dal primo posto di SEAT_SLOTS (posizione 6, poi 5)
  assert.equal(places[SEAT_SLOTS.indexOf(0)], "c");
  assert.equal(places[SEAT_SLOTS.indexOf(1)], "a");
  assert.equal(places.filter((p) => p !== null).length, 3);
});

test("posti scelti: stesso posto, vince chi è entrato prima nel gruppo", () => {
  const places = placeSeats(["a", "b"], () => 3, ["b", "a"]);
  assert.equal(places[3], "a");
  assert.equal(places[SEAT_SLOTS.indexOf(0)], "b");
});

test("posti scelti: fuori intervallo o non interi valgono come automatici", () => {
  const places = placeSeats(["a", "b", "c"], (id) => ({ a: 8, b: -1, c: 1.5 })[id] ?? null, ["a", "b", "c"]);
  assert.deepEqual([6, 5, 4].map((p) => places[p]), ["a", "b", "c"]);
});

test("posti scelti: il posto scelto prende anche quello che sarebbe toccato in automatico", () => {
  const places = placeSeats(["a", "b"], (id) => (id === "b" ? SEAT_SLOTS.indexOf(0) : null), ["a", "b"]);
  assert.equal(places[SEAT_SLOTS.indexOf(0)], "b");
  assert.equal(places[SEAT_SLOTS.indexOf(1)], "a");
  assert.deepEqual(placeSeats([], () => null, []), Array(8).fill(null));
});

test("testi: timer, ultima volta, sottotitolo, posti", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(1512), "25:12");
  assert.equal(formatClock(3725), "1:02:05");
  assert.equal(formatClock(-4), "00:00");
  const now = 1_800_000_000_000;
  assert.equal(lastSeenText(null, now), "mai connesso");
  assert.equal(lastSeenText(now - 20_000, now), "ultima volta poco fa");
  assert.equal(lastSeenText(now - 5 * 60_000, now), "ultima volta 5 min fa");
  assert.equal(lastSeenText(now - 2 * 3_600_000, now), "ultima volta 2 h fa");
  assert.equal(lastSeenText(now - 30 * 3_600_000, now), "ultima volta ieri");
  assert.equal(lastSeenText(now - 3 * 86_400_000, now), "ultima volta 3 giorni fa");
  assert.equal(roomSubtitle(9, 2, 7, 13), "9 presenti in 2 sale, 7 stanno studiando. 13 membri in tutto.");
  assert.equal(roomSubtitle(1, 1, 1, 1), "1 presente in una sala, 1 sta studiando. 1 membro in tutto.");
  assert.equal(roomInfo(3, 8), "3 al tavolo, 5 posti liberi");
  assert.equal(roomInfo(7, 8), "7 al tavolo, 1 posto libero");
});

console.log(`OK: ${passed} prove superate`);
