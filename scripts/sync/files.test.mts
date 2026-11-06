/*
 * Prove del piano dei file del sync (src/widgets/notes/sync/filePlan.ts). Lancio (da questa cartella del repo):
 *   node scripts/sync/files.test.mts
 */
import assert from "node:assert/strict";
import { planFiles, type KnownFile, type WantedFile } from "../../src/widgets/notes/sync/filePlan.ts";

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

const want = (name: string, local: boolean, extra: Partial<WantedFile> = {}): WantedFile => ({
  scope: "note",
  ownerId: 1,
  ownerUid: "n1",
  name,
  optional: false,
  local,
  ...extra,
});
const known = (name: string, extra: Partial<KnownFile> = {}): KnownFile => ({ scope: "note", ownerUid: "n1", name, ...extra });
const summary = (actions: ReturnType<typeof planFiles>) =>
  actions.map((a) => `${a.type}:${a.file.name}`).sort();

test("c'è qui e non nel cloud: si carica; già allineato: niente", () => {
  assert.deepEqual(summary(planFiles([want("a.pdf", true), want("b.png", true)], [known("b.png")])), ["upload:a.pdf"]);
});

test("chiesto ma non c'è qui: si scarica (anche se risultava allineato)", () => {
  assert.deepEqual(summary(planFiles([want("a.pdf", false), want("b.png", false)], [known("b.png")])), ["download:a.pdf", "download:b.png"]);
});

test("allineato ma non più chiesto (allegato cancellato): si toglie", () => {
  assert.deepEqual(summary(planFiles([want("a.pdf", true)], [known("a.pdf"), known("vecchio.png")])), ["forget:vecchio.png"]);
});

test("stesso nome in note o ambiti diversi: file diversi", () => {
  const actions = planFiles(
    [want("a.pdf", true), want("a.pdf", true, { ownerUid: "n2", ownerId: 2 }), want("a.pdf", false, { scope: "collection", ownerUid: "c1" })],
    [known("a.pdf")]
  );
  assert.deepEqual(summary(actions), ["download:a.pdf", "upload:a.pdf"]);
  assert.equal(actions.find((a) => a.type === "upload")?.file.ownerUid, "n2");
});

test("lo stesso file chiesto due volte (due pagine con lo stesso PDF): un'azione sola", () => {
  assert.deepEqual(summary(planFiles([want("a.pdf", false), want("a.pdf", false)], [])), ["download:a.pdf"]);
});

test("niente chiesto e niente noto (primo giro di un dispositivo nuovo): niente", () => {
  assert.deepEqual(planFiles([], []), []);
});

console.log(`OK: ${passed} prove superate`);
