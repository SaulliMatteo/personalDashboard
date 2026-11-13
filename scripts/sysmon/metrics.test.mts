/*
 * Prove della scelta delle metriche del Monitor di sistema (widgets/sysmon/lib/metrics.ts) e dello storico in
 * memoria (lib/history.ts): limite per taglia, caselle disattivate, riduzione della taglia, metriche non
 * disponibili, impostazione rovinata, finestra dei 60 s. Funzioni pure. Lancio (dalla cartella del repo):
 *   node scripts/sysmon/metrics.test.mts
 */
import assert from "node:assert/strict";
import {
  MAX_METRICS,
  effectiveMetrics,
  isMetricDisabled,
  metricAvailable,
  parseMetrics,
  serializeMetrics,
  sysmonSize,
  toggleMetric,
  trimToSize,
  type MetricId,
} from "../../src/widgets/sysmon/lib/metrics.ts";
import { HISTORY_WINDOW_MS, pushPoint, type HistoryPoint } from "../../src/widgets/sysmon/lib/history.ts";
import { HEAD_SPACE, fitWidget } from "../../src/widgets/sysmon/lib/fit.ts";

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

const all = () => true;
/** Un PC Windows senza batteria: temperatura CPU mai, il resto sì. */
const windowsDesktop = (id: MetricId) => metricAvailable({ cpuTemp: false, gpu: true, temps: true, battery: false }, id);

test("massimi per taglia: Piccola 3, Larga 4, Alta 5, Media 8", () => {
  assert.deepEqual(MAX_METRICS, { S: 3, W: 4, T: 5, M: 8 });
  assert.equal(sysmonSize("S"), "S");
  assert.equal(sysmonSize("T"), "T");
  assert.equal(sysmonSize("W"), "W");
  assert.equal(sysmonSize("M"), "M");
  assert.equal(sysmonSize("XL"), "M", "taglie fuori catalogo sulla più vicina");
});

test("toggle non va oltre il massimo della taglia", () => {
  let ids: MetricId[] = ["cpu", "gpu", "memory"];
  ids = toggleMetric(ids, "network", "S", all);
  assert.deepEqual(ids, ["cpu", "gpu", "memory"], "in Piccola la quarta non entra");
  ids = toggleMetric(ids, "network", "W", all);
  assert.deepEqual(ids, ["cpu", "gpu", "memory", "network"]);
  ids = toggleMetric(ids, "gpu", "W", all);
  assert.deepEqual(ids, ["cpu", "memory", "network"], "togliere si può sempre");
});

test("le caselle si disattivano a massimo raggiunto, tranne quelle accese", () => {
  const ids: MetricId[] = ["cpu", "gpu", "memory"];
  assert.equal(isMetricDisabled(ids, "disk", "S", all), true);
  assert.equal(isMetricDisabled(ids, "cpu", "S", all), false, "una accesa si può spegnere");
  assert.equal(isMetricDisabled(ids, "disk", "W", all), false);
});

test("temperatura CPU disattivata su Windows, e non si accende", () => {
  assert.equal(isMetricDisabled([], "cpuTemp", "M", windowsDesktop), true);
  assert.deepEqual(toggleMetric([], "cpuTemp", "M", windowsDesktop), []);
  assert.equal(isMetricDisabled([], "battery", "M", windowsDesktop), true, "desktop senza batteria");
});

test("riduzione della taglia: si tolgono le ultime nell'ordine della lista", () => {
  const eight: MetricId[] = ["cpu", "gpu", "memory", "disk", "network", "temps", "processes", "battery"];
  assert.deepEqual(trimToSize(eight, "W"), ["cpu", "gpu", "memory", "disk"]);
  assert.deepEqual(trimToSize(eight, "S"), ["cpu", "gpu", "memory"]);
  assert.deepEqual(trimToSize(["network", "cpu"], "S"), ["cpu", "network"], "già sotto il massimo: invariata");
});

test("metriche mostrate: scelta salvata o proposta, solo quelle disponibili", () => {
  assert.deepEqual(effectiveMetrics(null, "S", windowsDesktop), ["cpu", "gpu", "memory"]);
  assert.deepEqual(effectiveMetrics(null, "W", windowsDesktop), ["cpu", "gpu", "memory", "network"]);
  // Su un Mac portatile la proposta Grande arriva a 8 con la batteria.
  const mac = (id: MetricId) => metricAvailable({ cpuTemp: true, gpu: true, temps: true, battery: true }, id);
  assert.equal(effectiveMetrics(null, "M", mac).length, 8);
  // Un DB copiato da un portatile: la batteria scelta lì qui non c'è e non occupa posto.
  assert.deepEqual(effectiveMetrics(["battery", "cpu"], "S", windowsDesktop), ["cpu"]);
});

test("impostazione: vuota = mai scelta, id sconosciuti e doppioni ignorati", () => {
  assert.equal(parseMetrics(""), null);
  assert.deepEqual(parseMetrics("memory, cpu,boh,cpu"), ["cpu", "memory"]);
  assert.deepEqual(parseMetrics(","), [], "scelta vuota è una scelta (nessuna metrica)");
  assert.equal(serializeMetrics(["network", "cpu"]), "cpu,network");
});

test("senza capacità (risposta non ancora arrivata) solo le metriche sempre presenti", () => {
  assert.equal(metricAvailable(null, "cpu"), true);
  assert.equal(metricAvailable(null, "gpu"), false);
  assert.equal(metricAvailable(null, "cpuTemp"), false);
});

test("storico: tiene solo gli ultimi 60 s, a qualsiasi intervallo", () => {
  for (const step of [1000, 2000, 5000]) {
    let points: HistoryPoint[] = [];
    for (let t = 0; t <= 180_000; t += step) points = pushPoint(points, { atMs: t, value: t });
    assert.equal(points.length, HISTORY_WINDOW_MS / step, `a ${step} ms`);
    assert.equal(points.at(-1)!.atMs, 180_000);
    assert.ok(points[0].atMs > 180_000 - HISTORY_WINDOW_MS);
  }
});

test("storico: un dato mancante resta null (buco nel grafico, non uno 0)", () => {
  const points = pushPoint([{ atMs: 0, value: 10 }], { atMs: 2000, value: null });
  assert.deepEqual(points.map((p) => p.value), [10, null]);
});

test("storico: l'orologio che torna indietro non lascia punti dal futuro", () => {
  const points = pushPoint([{ atMs: 10_000, value: 1 }, { atMs: 12_000, value: 2 }], { atMs: 5000, value: 3 });
  assert.deepEqual(points, [{ atMs: 5000, value: 3 }]);
});

// Misure vere delle celle (contenuto sotto l'intestazione) dall'app a 1920×1040 e a 1200×620.
test("forma: con spazio la forma del mockup", () => {
  assert.equal(fitWidget("S", 3, false, 232, 150).mode, "full");
  assert.equal(fitWidget("M", 7, true, 515, 390).mode, "full");
  assert.equal(fitWidget("W", 4, false, 480, 120).mode, "full");
  // Alta come nel mockup (cella 196×370): 5 tessere con i processi
  assert.equal(fitWidget("T", 5, true, 160, 306).mode, "full");
});

test("forma: Alta bassa, una riga per metrica in una colonna", () => {
  const t = fitWidget("T", 5, true, 160, 200);
  assert.equal(t.mode, "lines");
  assert.equal(t.count, 5);
  assert.equal(trimToSize(["cpu", "gpu", "memory", "disk", "network", "temps", "processes"], "T").length, 5);
});

test("forma: cella piccola, righe al posto dell'anello e delle tessere sovrapposte", () => {
  const s = fitWidget("S", 3, false, 110, 55);
  assert.equal(s.mode, "lines");
  assert.equal(s.count, 3, "tre righe entrano togliendo l'intestazione");
  assert.equal(s.bare, true);
  const m = fitWidget("M", 7, true, 275, 180);
  assert.equal(m.mode, "lines");
  assert.equal(m.count, 7);
});

test("forma: mai testi schiacciati, piuttosto meno metriche (le prime della lista)", () => {
  const tiny = fitWidget("M", 8, true, 200, 40);
  assert.ok(tiny.count < 8 && tiny.count >= 1);
  assert.equal(tiny.bare, true);
  // con le righe che restano, ognuna ha almeno l'altezza di una riga di testo
  const rows = Math.ceil(tiny.count / 2);
  assert.ok((40 + HEAD_SPACE - (rows - 1) * 5) / rows >= 22);
});

test("forma: prima misura (cella ancora a 0) = forma piena, nessun salto a vuoto", () => {
  assert.deepEqual(fitWidget("S", 3, false, 0, 0).mode, "full");
});

console.log(`sysmon metrics: ${passed} prove passate`);
