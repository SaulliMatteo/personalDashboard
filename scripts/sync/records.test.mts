/*
 * Prove della traduzione da riga locale a elemento del cloud e ritorno (core/sync/engine/records.ts).
 * Lancio (da questa cartella del repo):
 *   npx rolldown scripts/sync/records.test.mts --file node_modules/.tmp/sync-records.test.mjs --platform node
 *   node node_modules/.tmp/sync-records.test.mjs
 */
import assert from "node:assert/strict";
import { dataToRow, isNewer, isSyncedSetting, rowToData, type PullContext, type PushContext } from "../../src/core/sync/engine/records";
import { kindOrder, SYNC_TABLES, specOf, type SyncKind } from "../../src/core/sync/tables";

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

/**
 * Due dispositivi finti con id locali diversi per gli stessi elementi: A (il PC) e B (il telefono).
 * `ids[kind]` = coppie [uid, id su A, id su B] (null = su quel dispositivo non c'è).
 */
const ids: Partial<Record<SyncKind, [string, number | null, number | null][]>> = {
  subject: [["u-mat", 3, 7]],
  folder: [["u-fold", 1, 2]],
  note: [["u-nota", 10, 40], ["u-altra", 11, 41]],
  collection: [["u-coll", 5, 1]],
  field: [["u-titolo", 20, 1], ["u-link", 21, 2], ["u-stato", 22, 3]],
  row: [["u-riga", 30, 9]],
  view: [["u-vista", 50, 4]],
};
const fieldTypes: Record<"A" | "B", Record<number, string>> = {
  A: { 20: "text", 21: "note", 22: "select" },
  B: { 1: "text", 2: "note", 3: "select" },
};

function push(device: "A" | "B", deviceId = `dev-${device}`): PushContext {
  const col = device === "A" ? 1 : 2;
  return {
    deviceId,
    uidOf: (kind, local) => ids[kind]?.find((x) => x[col] === local)?.[0] ?? null,
    fieldTypeOf: (local) => fieldTypes[device][local] ?? null,
  };
}

function pull(device: "A" | "B", lenient = false, deviceId = `dev-${device}`): PullContext {
  const col = device === "A" ? 1 : 2;
  return {
    deviceId,
    lenient,
    localOf: (kind, uid) => (ids[kind]?.find((x) => x[0] === uid)?.[col] as number | null | undefined) ?? null,
    fieldTypeOf: (local) => fieldTypes[device][local] ?? null,
  };
}

/** Da A al cloud e dal cloud a B. */
function roundTrip(kind: SyncKind, row: Record<string, unknown>) {
  const data = rowToData(specOf(kind), row, push("A"));
  assert.ok(data, "da mandare");
  return { data, result: dataToRow(kind, structuredClone(data), pull("B")) };
}

// ---------------------------------------------------------------- tabelle

test("ogni riferimento punta a un tipo che viene prima (ordine di dipendenza), tranne la cartella madre", () => {
  for (const spec of SYNC_TABLES) {
    for (const [column, ref] of Object.entries(spec.refs)) {
      assert.ok(spec.columns.includes(column), `${spec.kind}.${column} tra le colonne`);
      if (ref.kind === spec.kind) continue;
      assert.ok(kindOrder(ref.kind) < kindOrder(spec.kind), `${spec.kind}.${column} -> ${ref.kind}`);
    }
  }
});

test("le colonne del singolo dispositivo non viaggiano", () => {
  const note = specOf("note");
  assert.ok(!note.columns.includes("disk_path") && !note.columns.includes("synced_at"));
  assert.equal(isSyncedSetting("themeMode"), false);
  assert.equal(isSyncedSetting("studyAutoStopMinutes"), false);
  assert.equal(isSyncedSetting("theme"), true);
  assert.equal(isSyncedSetting("userName"), true);
});

// ---------------------------------------------------------------- push

test("riferimenti: id locale -> id globale -> id locale dell'altro dispositivo", () => {
  const { data, result } = roundTrip("page", { id: 99, note_id: 10, position: 0, content: "<p>x</p>", ink: "[]", background: "dots", color: null, pdf: null, pdf_ink: "{}", pins: "[]" });
  assert.equal(data.note_id, "u-nota");
  assert.ok(!("id" in data), "la chiave locale non viaggia");
  assert.deepEqual(result, { ok: true, row: { note_id: 40, position: 0, content: "<p>x</p>", ink: "[]", background: "dots", color: null, pdf: null, pdf_ink: "{}", pins: "[]" } });
});

test("cartella madre e cartella della nota possono essere NULL", () => {
  const { data, result } = roundTrip("folder", { id: 1, parent_id: null, name: "Uni", color: null, icon: "folder", created_at: 5 });
  assert.equal(data.parent_id, null);
  assert.ok(result.ok && result.row.parent_id === null);
});

test("riga orfana (la sua nota qui non c'è più): non si manda", () => {
  assert.equal(rowToData(specOf("page"), { id: 1, note_id: 999, position: 0, content: "", ink: "[]", background: "dots", pdf_ink: "{}", pins: "[]" }, push("A")), null);
});

test("cartella madre sparita: si manda senza", () => {
  const data = rowToData(specOf("folder"), { id: 3, parent_id: 999, name: "Sotto", icon: "folder", created_at: 1 }, push("A"));
  assert.ok(data && data.parent_id === null);
});

test("impostazioni: quelle del dispositivo non partono", () => {
  assert.equal(rowToData(specOf("setting"), { key: "themeMode", value: '"notte"' }, push("A")), null);
  assert.deepEqual(rowToData(specOf("setting"), { key: "theme", value: '"opaco"' }, push("A")), { value: '"opaco"' });
});

// ---------------------------------------------------------------- contenuti

test("pagina: viste e riferimenti a righe nell'HTML", () => {
  const html = '<div data-block="collection-view" data-view="50"></div><p>vedi <span data-ref-row="30">riga</span> e <span data-ref-row="777">sparita</span></p>';
  const { data, result } = roundTrip("page", { id: 1, note_id: 10, position: 0, content: html, ink: "[]", background: "dots", pdf_ink: "{}", pins: "[]" });
  assert.equal(data.content, '<div data-block="collection-view" data-view="u-vista"></div><p>vedi <span data-ref-row="u-riga">riga</span> e <span data-ref-row="0">sparita</span></p>');
  assert.ok(result.ok);
  assert.equal(result.row.content, '<div data-block="collection-view" data-view="4"></div><p>vedi <span data-ref-row="9">riga</span> e <span data-ref-row="0">sparita</span></p>');
});

test("pagina senza riferimenti: il testo non cambia (neanche con attributi simili)", () => {
  const html = '<p data-bm="abc">testo con data-view scritto</p>';
  const { data } = roundTrip("page", { id: 1, note_id: 10, position: 0, content: html, ink: "[]", background: "dots", pdf_ink: "{}", pins: "[]" });
  assert.equal(data.content, html);
});

test("riga di una raccolta: campi per id globale, campo nota tradotto, campi spariti tolti", () => {
  const rowDataA = JSON.stringify({ 20: "Esame", 21: 11, 22: "c1", 999: "campo cancellato" });
  const { data, result } = roundTrip("row", { id: 30, collection_id: 5, data: rowDataA, position: 0, created_at: 1, updated_at: 2, deleted_at: null });
  assert.deepEqual(JSON.parse(String(data.data)), { "u-titolo": "Esame", "u-link": "u-altra", "u-stato": "c1" });
  assert.ok(result.ok);
  assert.equal(result.row.collection_id, 1);
  assert.deepEqual(JSON.parse(String(result.row.data)), { 1: "Esame", 2: 41, 3: "c1" });
});

test("riga: campo nota che punta a una nota cancellata sparisce", () => {
  const { data } = roundTrip("row", { id: 30, collection_id: 5, data: JSON.stringify({ 21: 555 }), position: 0, created_at: 1, updated_at: 2 });
  assert.deepEqual(JSON.parse(String(data.data)), {});
});

test("vista: filtro, ordinamento, campi nascosti e raggruppamento", () => {
  const view = {
    id: 50,
    collection_id: 5,
    name: "Esami",
    layout: "bacheca",
    filter: JSON.stringify([{ field: 22, op: "uguale", value: "c1" }, { field: 998, op: "pieno" }]),
    sort: JSON.stringify({ field: 20, dir: -1 }),
    fields: JSON.stringify([21, 997]),
    group_field: 22,
  };
  const { data, result } = roundTrip("view", view);
  assert.deepEqual(JSON.parse(String(data.filter)), [{ field: "u-stato", op: "uguale", value: "c1" }]);
  assert.deepEqual(JSON.parse(String(data.sort)), { field: "u-titolo", dir: -1 });
  assert.deepEqual(JSON.parse(String(data.fields)), ["u-link"]);
  assert.equal(data.group_field, "u-stato");
  assert.ok(result.ok);
  assert.deepEqual(JSON.parse(String(result.row.filter)), [{ field: 3, op: "uguale", value: "c1" }]);
  assert.deepEqual(JSON.parse(String(result.row.sort)), { field: 1, dir: -1 });
  assert.deepEqual(JSON.parse(String(result.row.fields)), [2]);
  assert.equal(result.row.group_field, 3);
});

test("vista senza ordinamento: resta null", () => {
  const { data } = roundTrip("view", { id: 50, collection_id: 5, name: "", layout: "tabella", filter: "[]", sort: null, fields: "[]", group_field: null });
  assert.equal(data.sort, null);
});

// ---------------------------------------------------------------- pull

test("materia da una versione vecchia (senza giorni né obiettivo): valori di ripiego, non NULL", () => {
  const result = dataToRow("subject", { name: "Analisi", created_at: 1, color: "#fff", mode: "pomodoro", work_minutes: 25, short_break_minutes: 5, long_break_minutes: 15, cycles_before_long_break: 4, archived_at: null }, pull("B"));
  assert.ok(result.ok);
  assert.equal(result.row.study_days, 0);
  assert.equal(result.row.daily_goal_minutes, 0);
  const nuova = dataToRow("subject", { name: "Fisica", created_at: 1, study_days: 5, daily_goal_minutes: 60 }, pull("B"));
  assert.ok(nuova.ok);
  assert.equal(nuova.row.study_days, 5);
  assert.equal(nuova.row.daily_goal_minutes, 60);
});

test("elemento arrivato prima di quello a cui punta: rimandato con l'id che manca", () => {
  const result = dataToRow("page", { note_id: "u-nuova", position: 0, content: '<div data-view="u-vista-nuova"></div>', ink: "[]", background: "dots", pdf_ink: "{}", pins: "[]" }, pull("B"));
  assert.deepEqual(result, { ok: false, missing: ["u-nuova", "u-vista-nuova"] });
});

test("rimandato troppe volte (lenient): i riferimenti nei contenuti diventano 0, quelli NULLabili NULL", () => {
  const page = dataToRow("page", { note_id: "u-nota", position: 0, content: '<div data-view="u-sparita"></div>', ink: "[]", background: "dots", pdf_ink: "{}", pins: "[]" }, pull("B", true));
  assert.ok(page.ok);
  assert.equal(page.row.content, '<div data-view="0"></div>');
  const folder = dataToRow("folder", { parent_id: "u-sparita", name: "x", icon: "folder", created_at: 1 }, pull("B", true));
  assert.ok(folder.ok && folder.row.parent_id === null);
});

test("lenient non basta se manca un riferimento obbligatorio (la nota di una pagina)", () => {
  const result = dataToRow("page", { note_id: "u-sparita", position: 0, content: "", ink: "[]", background: "dots", pdf_ink: "{}", pins: "[]" }, pull("B", true));
  assert.deepEqual(result, { ok: false, missing: ["u-sparita"] });
});

test("colonne mancanti nei dati arrivati: NULL (elemento da una versione più vecchia)", () => {
  const result = dataToRow("note", { folder_id: null, title: "T", tags: "[]", starred: 0, created_at: 1, updated_at: 2, deleted_at: null }, pull("B"));
  assert.ok(result.ok);
  assert.equal(result.row.font, null);
  assert.equal(result.row.title_color, null);
});

// ---------------------------------------------------------------- sessioni

test("sessioni: l'origine è il dispositivo che le ha registrate", () => {
  const session = { id: 1, subject_id: 3, started_at: 100, ended_at: 200, duration_seconds: 100, origin_device: null };
  const data = rowToData(specOf("session"), session, push("A"));
  assert.ok(data);
  assert.equal(data.origin_device, "dev-A", "registrata sul PC");
  assert.equal(data.subject_id, "u-mat");
  const onPhone = dataToRow("session", structuredClone(data), pull("B"));
  assert.ok(onPhone.ok);
  assert.equal(onPhone.row.origin_device, "dev-A", "sul telefono resta del PC");
  assert.equal(onPhone.row.subject_id, 7);
  const backHome = dataToRow("session", structuredClone(data), pull("A"));
  assert.ok(backHome.ok);
  assert.equal(backHome.row.origin_device, null, "tornata sul PC: di nuovo «fatta qui»");
});

test("sessione arrivata da un altro dispositivo e rimandata: l'origine non cambia", () => {
  const data = rowToData(specOf("session"), { id: 2, subject_id: 3, started_at: 1, ended_at: 2, duration_seconds: 1, origin_device: "dev-B" }, push("A"));
  assert.equal(data?.origin_device, "dev-B");
});

// ---------------------------------------------------------------- conflitti

test("vince l'ultima modifica; a parità decide il dispositivo, uguale per tutti", () => {
  assert.equal(isNewer({ changedAt: 2, deviceId: "a" }, { changedAt: 1, deviceId: "z" }), true);
  assert.equal(isNewer({ changedAt: 1, deviceId: "z" }, { changedAt: 2, deviceId: "a" }), false);
  assert.equal(isNewer({ changedAt: 5, deviceId: "b" }, { changedAt: 5, deviceId: "a" }), true);
  assert.equal(isNewer({ changedAt: 5, deviceId: "a" }, { changedAt: 5, deviceId: "b" }), false);
  assert.equal(isNewer({ changedAt: 5, deviceId: "a" }, { changedAt: 5, deviceId: "a" }), false, "stessa versione: non è più nuova");
});

console.log(`OK: ${passed} prove superate`);
