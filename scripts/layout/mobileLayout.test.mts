/*
 * Prove del layout del telefono (core/layout/mobileLayout.ts): taglie ammesse, layout di partenza, aggiunta,
 * spostamento con scambio, cambio di taglia, righe pari per gli alti 2, pagine piene, pagine vuote, layout
 * rovinato dal DB, orizzontale. Funzioni pure. Lancio (dalla cartella del repo):
 *   node scripts/layout/mobileLayout.test.mts
 */
import assert from "node:assert/strict";
import {
  MAX_PAGES,
  addItem,
  cellFromGrid,
  firstFree,
  gridPlacement,
  moveItem,
  packLayout,
  pageCount,
  phoneSizeFor,
  phoneSizes,
  resizeItem,
  sanitizeLayout,
  trimEmptyPages,
  type MobileItem,
} from "../../src/core/layout/mobileLayout.ts";

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

/** Nessuna sovrapposizione, tutto dentro la pagina, alti 2 su righe pari. */
function assertValid(items: readonly MobileItem[]) {
  const ids = new Set<string>();
  for (const it of items) {
    assert.ok(!ids.has(it.i), `doppione ${it.i}`);
    ids.add(it.i);
    assert.ok(it.page >= 0 && it.page < MAX_PAGES, `pagina fuori: ${it.i}`);
    assert.ok(it.x >= 0 && it.y >= 0 && it.x + it.w <= 2 && it.y + it.h <= 4, `fuori pagina: ${it.i}`);
    if (it.h === 2) assert.equal(it.y % 2, 0, `alto 2 su riga dispari: ${it.i}`);
  }
  for (const a of items) {
    for (const b of items) {
      if (a === b || a.page !== b.page) continue;
      const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!hit, `sovrapposti ${a.i} e ${b.i}`);
    }
  }
}

const S = { w: 1, h: 1 };
const W = { w: 2, h: 1 };
const T = { w: 1, h: 2 };
const M = { w: 2, h: 2 };

test("taglie del telefono: solo fino a 2×2, senza doppioni", () => {
  assert.deepEqual(phoneSizes([{ w: 2, h: 2 }, { w: 1, h: 1 }, { w: 3, h: 2 }, { w: 3, h: 3 }]), [M, S]);
  assert.deepEqual(phoneSizes([{ w: 3, h: 1 }]), [S]);
  // taglie solo del telefono: in fondo, senza doppioni
  assert.deepEqual(phoneSizes([{ w: 2, h: 2 }, { w: 1, h: 1 }], [{ w: 2, h: 1 }, { w: 1, h: 1 }]), [M, S, { w: 2, h: 1 }]);
});

test("taglia di partenza: la stessa, altrimenti la più grande che non la supera", () => {
  assert.deepEqual(phoneSizeFor(M, [M, S]), M);
  assert.deepEqual(phoneSizeFor({ w: 3, h: 1 }, [S, M]), S);
  assert.deepEqual(phoneSizeFor({ w: 3, h: 2 }, [S, W, M]), M);
  assert.deepEqual(phoneSizeFor({ w: 1, h: 1 }, [W]), W);
});

test("layout di partenza: pagine riempite in ordine", () => {
  const items = packLayout([
    { id: "study", size: M },
    { id: "a", size: S },
    { id: "b", size: S },
    { id: "yt", size: W },
    { id: "big", size: M },
  ]);
  assertValid(items);
  assert.deepEqual(items.find((i) => i.i === "study"), { i: "study", page: 0, x: 0, y: 0, w: 2, h: 2 });
  assert.deepEqual(items.find((i) => i.i === "a"), { i: "a", page: 0, x: 0, y: 2, w: 1, h: 1 });
  assert.deepEqual(items.find((i) => i.i === "yt"), { i: "yt", page: 0, x: 0, y: 3, w: 2, h: 1 });
  // la pagina 1 è piena: la 2×2 va sulla pagina dopo
  assert.deepEqual(items.find((i) => i.i === "big"), { i: "big", page: 1, x: 0, y: 0, w: 2, h: 2 });
});

test("alto 2 mai su riga dispari", () => {
  const items = packLayout([{ id: "a", size: W }, { id: "t", size: T }]);
  assertValid(items);
  assert.equal(items.find((i) => i.i === "t")!.y, 2);
});

test("aggiunta: niente doppioni, null senza posto", () => {
  let items: MobileItem[] = [];
  for (let n = 0; n < MAX_PAGES; n++) items = addItem(items, `m${n}`, M)!;
  for (let n = 0; n < MAX_PAGES; n++) items = addItem(items, `n${n}`, M)!;
  assertValid(items);
  assert.equal(addItem(items, "x", S), null);
  assert.equal(addItem(items, "m0", S), null);
  assert.equal(firstFree(S, items), null);
});

test("spostamento su una cella occupata: scambio", () => {
  const items = packLayout([{ id: "a", size: S }, { id: "b", size: S }, { id: "c", size: S }]);
  const moved = moveItem(items, "a", { page: 0, x: 1, y: 0 });
  assertValid(moved);
  assert.deepEqual(moved.find((i) => i.i === "a"), { i: "a", page: 0, x: 1, y: 0, w: 1, h: 1 });
  assert.deepEqual(moved.find((i) => i.i === "b"), { i: "b", page: 0, x: 0, y: 0, w: 1, h: 1 });
});

test("spostamento su un'altra pagina", () => {
  const items = packLayout([{ id: "m", size: M }, { id: "n", size: M }, { id: "s", size: S }]);
  const moved = moveItem(items, "s", { page: 0, x: 1, y: 1 });
  assertValid(moved);
  // la 1×1 entra nella pagina 1 al posto della 2×2 n, che si sposta
  assert.equal(moved.find((i) => i.i === "s")!.page, 0);
  assert.equal(moved.length, 3);
});

test("spostamento di un alto 2 su riga dispari: si allinea alla metà", () => {
  const items = packLayout([{ id: "t", size: T }]);
  const moved = moveItem(items, "t", { page: 0, x: 1, y: 3 });
  assertValid(moved);
  assert.deepEqual(moved[0], { i: "t", page: 0, x: 1, y: 2, w: 1, h: 2 });
});

test("cambio di taglia: chi tocca si sposta, mai sovrapposizioni", () => {
  const items = packLayout([{ id: "a", size: S }, { id: "b", size: S }, { id: "c", size: S }, { id: "d", size: S }]);
  const resized = resizeItem(items, "a", M);
  assertValid(resized);
  assert.deepEqual(resized.find((i) => i.i === "a"), { i: "a", page: 0, x: 0, y: 0, w: 2, h: 2 });
  assert.equal(resized.length, 4);
});

test("cambio di taglia impossibile: niente cambia", () => {
  let items: MobileItem[] = [];
  for (let n = 0; n < MAX_PAGES * 8; n++) items = addItem(items, `s${n}`, S)!;
  const resized = resizeItem(items, "s0", M);
  assert.deepEqual(resized, items);
});

test("pagine vuote tolte e rinumerate", () => {
  const items: MobileItem[] = [
    { i: "a", page: 0, x: 0, y: 0, w: 1, h: 1 },
    { i: "b", page: 2, x: 0, y: 0, w: 1, h: 1 },
  ];
  assert.deepEqual(trimEmptyPages(items).map((i) => i.page), [0, 1]);
  assert.equal(pageCount(items), 3);
  assert.equal(pageCount([]), 1);
});

test("layout rovinato dal DB: sistemato", () => {
  const allowed = (id: string) => (id === "gone" ? null : id === "small" ? [S] : [S, M]);
  const items = sanitizeLayout(
    [
      { i: "a", page: 0, x: 0, y: 0, w: 2, h: 2 },
      { i: "b", page: 0, x: 1, y: 1, w: 1, h: 1 }, // sovrapposto ad a
      { i: "a", page: 1, x: 0, y: 0, w: 1, h: 1 }, // doppione
      { i: "gone", page: 0, x: 0, y: 3, w: 1, h: 1 }, // widget che non c'è più
      { i: "small", page: 0, x: 0, y: 2, w: 2, h: 2 }, // taglia non ammessa
      { i: "c", page: 9, x: 5, y: 1, w: 2, h: 2 }, // fuori pagina e su riga dispari
    ],
    allowed
  );
  assertValid(items);
  assert.deepEqual(items.map((i) => i.i).sort(), ["a", "b", "c", "small"]);
  // b (sovrapposto) ha preso il primo posto libero, (0,2): small va accanto
  assert.deepEqual(items.find((i) => i.i === "b"), { i: "b", page: 0, x: 0, y: 2, w: 1, h: 1 });
  assert.deepEqual(items.find((i) => i.i === "small"), { i: "small", page: 0, x: 1, y: 2, w: 1, h: 1 });
});

test("orizzontale: la metà bassa va a destra, e torna indietro", () => {
  assert.deepEqual(gridPlacement({ x: 1, y: 0 }, false), { col: 2, row: 1 });
  assert.deepEqual(gridPlacement({ x: 1, y: 0 }, true), { col: 2, row: 1 });
  assert.deepEqual(gridPlacement({ x: 0, y: 2 }, true), { col: 3, row: 1 });
  assert.deepEqual(gridPlacement({ x: 1, y: 3 }, true), { col: 4, row: 2 });
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 2; x++) {
      const { col, row } = gridPlacement({ x, y }, true);
      assert.deepEqual(cellFromGrid(col - 1, row - 1, true), { x, y });
    }
  }
});

console.log(`mobileLayout: ${passed} prove passate`);
