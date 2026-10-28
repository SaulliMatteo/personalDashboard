/*
 * Prove del foglietto Da fare dei Gruppi: cosa parte (solo se condiviso, prima le voci da fare, al massimo 30), cosa
 * si accetta, progresso e giorni. Funzioni pure, nessun server. Lancio (da questa cartella del repo):
 *   npx rolldown scripts/gruppi/todo.test.mts --file node_modules/.tmp/gruppi-todo.test.mjs --platform node
 *   node node_modules/.tmp/gruppi-todo.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildTodoPresence,
  nextMidnight,
  parseTodoChannelState,
  parseTodoPresence,
  startOfDay,
  TODO_SHARED_MAX,
  TODO_TEXT_MAX,
  todoProgress,
  type TodoItem,
} from "../../src/social/modules/todo/payload";

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

const item = (id: number, text: string, done = false): TodoItem => ({ id, text, done, doneAt: done ? 1 : null });
const items = [item(1, "Esercizi 1–6"), item(2, "Slide lezione 12", true), item(3, "Ripasso integrali")];

await test("senza condivisione parte solo la versione", () => {
  assert.deepEqual(buildTodoPresence(items, false), { v: 1 });
});

await test("condiviso: prima da fare, poi fatte; niente id né orari", () => {
  assert.deepEqual(buildTodoPresence(items, true), {
    v: 1,
    items: [
      { text: "Esercizi 1–6", done: false },
      { text: "Ripasso integrali", done: false },
      { text: "Slide lezione 12", done: true },
    ],
  });
});

await test("al massimo 30 voci, le fatte escono per prime", () => {
  const many = Array.from({ length: 40 }, (_, i) => item(i, `voce ${i}`, i < 20));
  const sent = buildTodoPresence(many, true).items ?? [];
  assert.equal(sent.length, TODO_SHARED_MAX);
  assert.equal(sent.filter((i) => !i.done).length, 20);
});

await test("ricevuto: valido passa, il resto no", () => {
  assert.deepEqual(parseTodoPresence({ v: 1, items: [{ text: " ciao‮ ", done: false, extra: 1 }] }), [{ text: "ciao", done: false }]);
  for (const bad of [
    { v: 1 },
    { v: 1, items: [] },
    { v: 2, items: [{ text: "a", done: false }] },
    { v: 1, items: [{ text: "a", done: "no" }] },
    { v: 1, items: [{ text: "   ", done: false }] },
    { v: 1, items: [{ text: "x".repeat(TODO_TEXT_MAX + 1), done: false }] },
    { v: 1, items: Array.from({ length: TODO_SHARED_MAX + 1 }, () => ({ text: "a", done: false })) },
  ]) {
    assert.equal(parseTodoPresence(bad), null, JSON.stringify(bad).slice(0, 80));
  }
});

await test("canale: chi non condivide non compare; con più dispositivi vale il primo che condivide", () => {
  const state = {
    anna: [{ v: 1 }, { v: 1, items: [{ text: "a", done: true }] }],
    bruno: [{ v: 1 }],
  };
  assert.deepEqual(parseTodoChannelState(state), { anna: [{ text: "a", done: true }] });
});

await test("progresso e giorni", () => {
  assert.deepEqual(todoProgress(items), { done: 1, total: 3 });
  const noon = new Date(2026, 9, 28, 12, 30).getTime();
  assert.equal(startOfDay(noon), new Date(2026, 9, 28).getTime());
  assert.equal(nextMidnight(noon), new Date(2026, 9, 29).getTime());
});

console.log(`OK: ${passed} prove superate`);
