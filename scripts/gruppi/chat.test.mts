/*
 * Prove dei Messaggi dal vivo dei Gruppi: validazione degli eventi, chat in memoria (chi può eliminare o reagire,
 * doppioni, non letti, limite), invio distanziato, "ha studiato N ore" e canali che rientrano da soli.
 * Funzioni pure, nessun server. Lancio (da questa cartella del repo):
 *   npx rolldown scripts/gruppi/chat.test.mts --file node_modules/.tmp/gruppi-chat.test.mjs --platform node
 *   node node_modules/.tmp/gruppi-chat.test.mjs
 */
import assert from "node:assert/strict";
import type { BroadcastListeners } from "../../src/core/cloud/broadcast";
import { ChatHub } from "../../src/social/modules/chat/chatHub";
import { applyChatEvent, canSendAt, CHAT_MAX_MESSAGES, continuesPrevious, EMPTY_CHAT, type ApplyOptions, type GroupChat } from "../../src/social/modules/chat/chatStore";
import { cleanMessageText, MESSAGE_MAX, newEventId, parseChatEvent, type ChatEvent } from "../../src/social/modules/chat/payload";
import { alreadyAnnounced, crossedStudyHour } from "../../src/social/modules/chat/studyMilestone";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (error) {
    console.error(`FALLITO: ${name}`);
    throw error;
  }
}

const NOW = 1_800_000_000_000;
const ANNA = "11111111-1111-1111-1111-111111111111";
const BRUNO = "22222222-2222-2222-2222-222222222222";
const DARIO = "33333333-3333-3333-3333-333333333333";
const members = new Set([ANNA, BRUNO]);
const opts = (countUnread = true): ApplyOptions => ({ isMember: (id) => members.has(id), me: ANNA, countUnread });

const msg = (id: string, from: string, text: string): ChatEvent => ({ v: 1, t: "msg", id, from, at: NOW, text });
const apply = (chat: GroupChat, ...events: ChatEvent[]) => events.reduce((c, e) => applyChatEvent(c, e, opts()), chat);

await test("un messaggio valido passa, pulito; i campi in più spariscono", () => {
  const e = parseChatEvent({ v: 1, t: "msg", id: "abcdefgh12", from: BRUNO, at: NOW, text: "  ciao‮ a tutti \u0007 ", extra: 1 }, NOW);
  assert.deepEqual(e, { v: 1, t: "msg", id: "abcdefgh12", from: BRUNO, at: NOW, text: "ciao a tutti" });
});

await test("eventi non validi: null", () => {
  const ok = { v: 1, t: "msg", id: "abcdefgh12", from: BRUNO, at: NOW, text: "ciao" };
  assert.ok(parseChatEvent(ok, NOW));
  for (const bad of [
    null,
    "testo",
    { ...ok, v: 2 },
    { ...ok, id: "corto" },
    { ...ok, id: "con spazi e <html>" },
    { ...ok, from: "non-un-utente!" },
    { ...ok, at: NOW + 2 * 86_400_000 },
    { ...ok, text: "   " },
    { ...ok, text: "x".repeat(MESSAGE_MAX + 1) },
    { ...ok, text: 42 },
    { ...ok, t: "boh" },
    { ...ok, t: "react", kind: "cuore", on: true },
    { ...ok, t: "react", kind: "up", on: "sì" },
    { ...ok, t: "sys", sys: "studied", hours: 0 },
    { ...ok, t: "sys", sys: "studied", hours: 2.5 },
    { ...ok, t: "sys", sys: "studied", hours: 25 },
    { ...ok, t: "sys", sys: "hacker" },
  ]) {
    assert.equal(parseChatEvent(bad, NOW), null, JSON.stringify(bad));
  }
  assert.deepEqual(parseChatEvent({ ...ok, t: "sys", sys: "studied", hours: 3 }, NOW), { v: 1, t: "sys", sys: "studied", hours: 3, id: ok.id, from: BRUNO, at: NOW });
});

await test("il testo resta testo: niente HTML interpretato, a capo ridotti", () => {
  assert.equal(cleanMessageText("<b>ciao</b>"), "<b>ciao</b>");
  assert.equal(cleanMessageText("a\r\n\r\n\r\n\r\nb"), "a\n\nb");
});

await test("chi non è membro viene ignorato", () => {
  const chat = apply(EMPTY_CHAT, msg("idmessaggio1", DARIO, "intruso"));
  assert.equal(chat, EMPTY_CHAT);
});

await test("doppioni ignorati, non letti solo dagli altri e solo se non si guarda", () => {
  let chat = apply(EMPTY_CHAT, msg("idmessaggio1", BRUNO, "uno"), msg("idmessaggio1", BRUNO, "uno di nuovo"), msg("idmessaggio2", ANNA, "mio"));
  assert.equal(chat.messages.length, 2);
  assert.equal(chat.unread, 1, "il mio non conta");
  chat = applyChatEvent(chat, msg("idmessaggio3", BRUNO, "letto subito"), opts(false));
  assert.equal(chat.unread, 1, "con la scheda aperta non conta");
});

await test("solo l'autore elimina; un messaggio eliminato perde testo e reazioni", () => {
  let chat = apply(EMPTY_CHAT, msg("idmessaggio1", BRUNO, "di bruno"));
  chat = apply(chat, { v: 1, t: "react", id: "idmessaggio1", from: ANNA, at: NOW, kind: "up", on: true });
  const tried = apply(chat, { v: 1, t: "del", id: "idmessaggio1", from: ANNA, at: NOW });
  assert.equal(tried, chat, "anna non elimina il messaggio di bruno");
  chat = apply(chat, { v: 1, t: "del", id: "idmessaggio1", from: BRUNO, at: NOW });
  assert.deepEqual(chat.messages[0], { ...chat.messages[0], text: "", deleted: true, reactions: { up: [], fire: [] } });
  const after = apply(chat, { v: 1, t: "react", id: "idmessaggio1", from: ANNA, at: NOW, kind: "fire", on: true });
  assert.equal(after, chat, "niente reazioni su un messaggio eliminato");
});

await test("reazioni idempotenti: una per tipo e persona", () => {
  const up = (from: string, on: boolean): ChatEvent => ({ v: 1, t: "react", id: "idmessaggio1", from, at: NOW, kind: "up", on });
  let chat = apply(EMPTY_CHAT, msg("idmessaggio1", BRUNO, "ciao"));
  chat = apply(chat, up(ANNA, true), up(ANNA, true), up(BRUNO, true));
  assert.deepEqual(chat.messages[0].reactions, { up: [ANNA, BRUNO], fire: [] });
  const same = apply(chat, up(DARIO, true));
  assert.equal(same, chat, "un estraneo non reagisce");
  chat = apply(chat, up(ANNA, false));
  assert.deepEqual(chat.messages[0].reactions.up, [BRUNO]);
});

await test("al massimo 200 messaggi: escono i più vecchi", () => {
  let chat: GroupChat = EMPTY_CHAT;
  for (let i = 0; i < CHAT_MAX_MESSAGES + 5; i++) chat = applyChatEvent(chat, msg(`idmessaggio${i}`, BRUNO, `n${i}`), opts(false));
  assert.equal(chat.messages.length, CHAT_MAX_MESSAGES);
  assert.equal(chat.messages[0].text, "n5");
});

await test("messaggi di sistema: entrato, ore di studio; niente non letti", () => {
  const chat = apply(
    EMPTY_CHAT,
    { v: 1, t: "sys", sys: "joined", id: "idsistema01", from: BRUNO, at: NOW },
    { v: 1, t: "sys", sys: "studied", hours: 3, id: "idsistema02", from: BRUNO, at: NOW }
  );
  assert.deepEqual(
    chat.messages.map((m) => [m.kind, m.hours]),
    [["joined", 0], ["studied", 3]]
  );
  assert.equal(chat.unread, 0);
});

await test("raggruppamento: lo stesso autore di fila continua il messaggio", () => {
  const chat = apply(EMPTY_CHAT, msg("idmessaggio1", BRUNO, "a"), msg("idmessaggio2", BRUNO, "b"), msg("idmessaggio3", ANNA, "c"));
  assert.deepEqual([0, 1, 2].map((i) => continuesPrevious(chat.messages, i)), [false, true, false]);
});

await test("un messaggio al secondo", () => {
  assert.ok(canSendAt(null, NOW));
  assert.ok(!canSendAt(NOW, NOW + 999));
  assert.ok(canSendAt(NOW, NOW + 1000));
  assert.match(newEventId(() => 0.5), /^[A-Za-z0-9]{16}$/);
});

await test("ha studiato N ore: solo superando l'ora mentre si studia", () => {
  assert.equal(crossedStudyHour(3590, 3610), 1);
  assert.equal(crossedStudyHour(10_790, 10_810), 3);
  assert.equal(crossedStudyHour(3610, 3630), null, "già superata");
  assert.equal(crossedStudyHour(0, 7300), null, "salto da dato caricato");
  assert.equal(crossedStudyHour(100, 200), null, "meno di un'ora");
  assert.ok(alreadyAnnounced("2026-10-28:3", "2026-10-28", 2));
  assert.ok(!alreadyAnnounced("2026-10-27:5", "2026-10-28", 1), "ieri non conta");
  assert.ok(!alreadyAnnounced(null, "2026-10-28", 1));
});

await test("canali: entra, manda solo se dentro, rientra dopo un errore, esce", async () => {
  const timers: { fn: () => void; at: number }[] = [];
  const joined: Record<string, BroadcastListeners> = {};
  const sent: unknown[] = [];
  const left: string[] = [];
  const received: unknown[] = [];
  const states: Record<string, string>[] = [];
  const hub = new ChatHub({
    join: (groupId, listeners) => {
      joined[groupId] = listeners;
      return {
        send: async (payload) => {
          if (payload.fail) throw new Error("no");
          sent.push(payload);
        },
        leave: async () => {
          left.push(groupId);
        },
      };
    },
    setTimer: (fn, ms) => timers.push({ fn, at: ms }),
    clearTimer: () => {},
    onMessage: (_g, payload) => received.push(payload),
    onChannels: (c) => states.push({ ...c }),
  });
  hub.setGroups(["g1"]);
  assert.equal(await hub.send("g1", { a: 1 }), false, "non ancora dentro");
  joined.g1.status("joined");
  assert.ok(hub.isJoined("g1"));
  assert.equal(await hub.send("g1", { a: 1 }), true);
  assert.equal(await hub.send("g1", { fail: true }), false, "server che non conferma");
  joined.g1.message({ ciao: 1 });
  assert.deepEqual(received, [{ ciao: 1 }]);
  const old = joined.g1;
  old.status("error");
  assert.equal(states.at(-1)?.g1, "error");
  assert.equal(timers.length, 1, "riprova più tardi");
  timers[0].fn();
  assert.notEqual(joined.g1, old, "rientrato con un canale nuovo");
  old.message({ vecchio: 1 });
  assert.equal(received.length, 1, "il canale vecchio non passa più nulla");
  hub.setGroups([]);
  assert.ok(left.includes("g1"));
  hub.stop();
});

console.log(`OK: ${passed} prove superate`);
