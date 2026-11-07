/*
 * Prove della campanella della dashboard (src/core/notify/inboxStore.ts): ordine, limiti (200 voci, 30 giorni),
 * non lette, numero sul pallino, giorni ("Oggi", "Ieri", data) e lettura di `open` salvato. Funzioni pure. Lancio
 * (dalla cartella del repo):
 *   node scripts/notify/inbox.test.mts
 */
import assert from "node:assert/strict";
import {
  INBOX_MAX,
  INBOX_MAX_AGE_MS,
  badgeText,
  dayLabel,
  groupInboxByDay,
  parseOpen,
  pruneInbox,
  sortInbox,
  unreadCount,
  type InboxItem,
} from "../../src/core/notify/inboxStore.ts";

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

const HOUR = 60 * 60_000;
// 7 novembre 2026 alle 15:00, ora locale
const NOW = new Date(2026, 10, 7, 15, 0).getTime();

function item(id: number, createdAt: number, readAt: number | null = null): InboxItem {
  return { id, kind: "pomodoroDone", title: `n${id}`, body: "", open: null, createdAt, readAt };
}

test("ordine: le più nuove prima, a parità di istante l'id più alto", () => {
  const sorted = sortInbox([item(1, NOW - HOUR), item(2, NOW), item(3, NOW)]);
  assert.deepEqual(sorted.map((x) => x.id), [3, 2, 1]);
});

test("limite di età: oltre 30 giorni si tolgono", () => {
  const { kept, removed } = pruneInbox([item(1, NOW - INBOX_MAX_AGE_MS - 1), item(2, NOW - INBOX_MAX_AGE_MS), item(3, NOW)], NOW);
  assert.deepEqual(kept.map((x) => x.id), [3, 2]);
  assert.deepEqual(removed, [1]);
});

test("limite di numero: restano le 200 più nuove", () => {
  const many = Array.from({ length: INBOX_MAX + 5 }, (_, i) => item(i + 1, NOW - i * 1000));
  const { kept, removed } = pruneInbox(many, NOW);
  assert.equal(kept.length, INBOX_MAX);
  assert.equal(kept[0].id, 1);
  assert.deepEqual(removed.sort((a, b) => a - b), [201, 202, 203, 204, 205]);
});

test("non lette e numero sul pallino", () => {
  assert.equal(unreadCount([item(1, NOW), item(2, NOW, NOW), item(3, NOW)]), 2);
  assert.equal(unreadCount([]), 0);
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
});

test("giorni: oggi, ieri, una data dell'anno e di un altro anno", () => {
  assert.equal(dayLabel(new Date(2026, 10, 7, 0, 1).getTime(), NOW), "Oggi");
  assert.equal(dayLabel(new Date(2026, 10, 6, 23, 59).getTime(), NOW), "Ieri");
  assert.equal(dayLabel(new Date(2026, 10, 6, 0, 0).getTime(), NOW), "Ieri");
  assert.equal(dayLabel(new Date(2026, 10, 3, 12, 0).getTime(), NOW), "3 novembre");
  assert.equal(dayLabel(new Date(2025, 11, 31, 12, 0).getTime(), NOW), "31 dicembre 2025");
});

test("ieri anche il giorno dopo il cambio dell'ora (fine ottobre)", () => {
  const afterChange = new Date(2026, 9, 26, 9, 0).getTime();
  assert.equal(dayLabel(new Date(2026, 9, 25, 1, 0).getTime(), afterChange), "Ieri");
});

test("gruppi per giorno nell'ordine della lista", () => {
  const list = sortInbox([item(1, NOW - 30 * HOUR), item(2, NOW - HOUR), item(3, NOW), item(4, NOW - 26 * HOUR)]);
  const groups = groupInboxByDay(list, NOW);
  assert.deepEqual(
    groups.map((g) => [g.label, g.items.map((x) => x.id)]),
    [
      ["Oggi", [3, 2]],
      ["Ieri", [4, 1]],
    ]
  );
});

test("open salvato: destinazioni conosciute, il resto null", () => {
  assert.deepEqual(parseOpen('{"type":"room"}'), { type: "room" });
  assert.deepEqual(parseOpen('{"type":"widget","widgetId":"study"}'), { type: "widget", widgetId: "study" });
  assert.deepEqual(parseOpen('{"type":"settings","section":"general"}'), { type: "settings", section: "general" });
  assert.equal(parseOpen(null), null);
  assert.equal(parseOpen("non json"), null);
  assert.equal(parseOpen('{"type":"widget","widgetId":""}'), null);
  assert.equal(parseOpen('{"type":"altro"}'), null);
  assert.equal(parseOpen("null"), null);
});

console.log(`inbox: ${passed} prove passate`);
