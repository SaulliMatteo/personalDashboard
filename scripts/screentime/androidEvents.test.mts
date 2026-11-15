/*
 * Prove del conteggio sul telefono (widgets/screentime/lib/androidEvents.ts e androidApps.ts): dagli eventi di uso di
 * Android ai tratti per app, e dai pacchetti alle righe (stessa chiave del PC dove c'è). Orari nell'ora locale.
 * Lancio (dalla cartella del repo):
 *   npx rolldown scripts/screentime/androidEvents.test.mts --file node_modules/.tmp/st-android.test.mjs --platform node
 *   node node_modules/.tmp/st-android.test.mjs
 */
import assert from "node:assert/strict";
import { EVENT_BACKGROUND as BG, EVENT_FOREGROUND as FG, EVENT_SCREEN_OFF as OFF, eventsToSegments, lostRange, type PhoneEvents } from "../../src/widgets/screentime/lib/androidEvents";
import { HOME_KEY, classifyPackage, classifyPhoneSegments } from "../../src/widgets/screentime/lib/androidApps";
import { SELF_KEY } from "../../src/widgets/screentime/lib/classify";
import { segmentsToDeltas } from "../../src/widgets/screentime/lib/aggregate";

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

const at = (h: number, m = 0, day = 13) => new Date(2026, 10, day, h, m).getTime();
const PKGS = ["com.discord", "com.instagram.android", "it.matteo.personalDashboard", "com.android.launcher3", "com.example.notes"];
/** Eventi [ms, tipo, pacchetto, schermata]: senza schermata, la principale dell'app (0). */
function batch(events: Array<[number, number, string | null, number?]>): PhoneEvents {
  return {
    events: events.map(([t, type, pkg, screen]) => [t, type, pkg === null ? -1 : PKGS.indexOf(pkg), pkg === null ? -1 : (screen ?? 0)]),
    packages: [
      { pkg: "com.discord", label: "Discord", category: 4 },
      { pkg: "com.instagram.android", label: "Instagram", category: -1 },
      { pkg: "it.matteo.personalDashboard", label: "personalDashboard", category: -1 },
      { pkg: "com.android.launcher3", label: "Launcher", category: -1 },
      { pkg: "com.example.notes", category: 7 },
    ],
    home: ["com.android.launcher3"],
    self: "it.matteo.personalDashboard",
  };
}

test("app in fila: ognuna conta fino all'arrivo della successiva, la pausa in ritardo si ignora", () => {
  const b = batch([
    [at(10), FG, "com.discord"],
    [at(10, 20), FG, "com.instagram.android"],
    [at(10, 20) + 300, BG, "com.discord"], // pausa della vecchia arrivata dopo la nuova
    [at(10, 50), BG, "com.instagram.android"],
  ]);
  const { segments, openSince } = eventsToSegments(b, at(11));
  assert.deepEqual(segments, [
    { startMs: at(10), endMs: at(10, 20), pkg: "com.discord" },
    { startMs: at(10, 20), endMs: at(10, 50), pkg: "com.instagram.android" },
  ]);
  assert.equal(openSince, null);
});

test("schermo spento a metà: il tratto si chiude, e un'altra schermata della stessa app non lo spezza", () => {
  const b = batch([
    [at(9), FG, "com.discord"],
    [at(9, 5), FG, "com.discord"],
    [at(9, 30), OFF, null],
    [at(9, 31), BG, "com.discord"],
  ]);
  assert.deepEqual(eventsToSegments(b, at(10)).segments, [{ startMs: at(9), endMs: at(9, 30), pkg: "com.discord" }]);
});

test("l'ultimo tratto aperto non si conta: si riparte dal suo inizio, e rilette le stesse cose non contano due volte", () => {
  const first = eventsToSegments(batch([[at(8), FG, "com.discord"], [at(8, 10), FG, "it.matteo.personalDashboard"]]), at(8, 30));
  assert.deepEqual(first.segments, [{ startMs: at(8), endMs: at(8, 10), pkg: "com.discord" }]);
  assert.equal(first.openSince, at(8, 10));
  // la lettura dopo riparte da openSince: arriva di nuovo l'evento di apertura della dashboard
  const second = eventsToSegments(batch([[at(8, 10), FG, "it.matteo.personalDashboard"], [at(8, 40), BG, "it.matteo.personalDashboard"]]), at(9));
  assert.deepEqual(second.segments, [{ startMs: at(8, 10), endMs: at(8, 40), pkg: "it.matteo.personalDashboard" }]);
  assert.equal(second.openSince, null);
});

test("Chrome dal link: la pausa della schermata di passaggio non chiude quella delle schede", () => {
  const b = batch([
    [at(16), FG, "com.discord", 0],
    [at(16, 1), BG, "com.discord", 0],
    [at(16, 1), FG, "com.example.notes", 1], // schermata di passaggio
    [at(16, 1), FG, "com.example.notes", 2], // schermata vera, prima della pausa dell'altra
    [at(16, 1) + 900, BG, "com.example.notes", 1],
    [at(16, 3), BG, "com.example.notes", 2],
  ]);
  assert.deepEqual(eventsToSegments(b, at(17)).segments, [
    { startMs: at(16), endMs: at(16, 1), pkg: "com.discord" },
    { startMs: at(16, 1), endMs: at(16, 3), pkg: "com.example.notes" },
  ]);
});

test("eventi dopo until ignorati; pausa mai arrivata: chiude la prossima app", () => {
  const b = batch([
    [at(7), FG, "com.example.notes"],
    [at(7, 45), FG, "com.discord"],
    [at(12), BG, "com.discord"],
  ]);
  const { segments, openSince } = eventsToSegments(b, at(11));
  assert.deepEqual(segments, [{ startMs: at(7), endMs: at(7, 45), pkg: "com.example.notes" }]);
  assert.equal(openSince, at(7, 45));
});

test("pacchetti: stessa chiave del PC, Home non conta, la dashboard è __self, categoria di Android; mezzanotte", () => {
  const b = batch([
    [at(23, 50), FG, "com.discord"],
    [at(0, 10, 14), FG, "com.android.launcher3"],
    [at(0, 12, 14), FG, "it.matteo.personalDashboard"],
    [at(0, 20, 14), FG, "com.instagram.android"],
    [at(0, 30, 14), FG, "com.example.notes"],
    [at(0, 40, 14), OFF, null],
  ]);
  const seg = classifyPhoneSegments(eventsToSegments(b, at(1, 0, 14)).segments, b);
  assert.deepEqual(seg.map((s) => [s.appKey, s.appLabel, s.category, s.counted]), [
    ["discord", "Discord", "chat", true],
    [HOME_KEY, "Home", "other", false],
    [SELF_KEY, "personalDashboard", "other", true],
    ["instagram", "Instagram", "social", true],
    ["com.example.notes", "Notes", "office", true],
  ]);
  const deltas = segmentsToDeltas(seg);
  assert.deepEqual(deltas.filter((d) => d.appKey === "discord").map((d) => [d.day, d.hour, d.seconds]), [
    ["2026-11-13", 23, 600],
    ["2026-11-14", 0, 600],
  ]);
  assert.equal(deltas.some((d) => d.appKey === HOME_KEY), false);
});

test("browser e app note: Chrome sempre Browser, Spotify musica anche senza titolo, Telegram dal nome", () => {
  assert.deepEqual(classifyPackage({ pkg: "com.android.chrome", label: "Chrome", category: -1 }), { appKey: "chrome", appLabel: "Chrome", category: "browser" });
  assert.equal(classifyPackage({ pkg: "com.spotify.music", label: "Spotify", category: 1 }).category, "music");
  assert.deepEqual(classifyPackage({ pkg: "org.telegram.plus", label: "Telegram", category: -1 }), { appKey: "org.telegram.plus", appLabel: "Telegram", category: "chat" });
  assert.equal(classifyPackage({ pkg: "com.game.thing", label: "Cose", category: 0 }).category, "game");
});

test("giorni persi: solo se Android ha la cronologia da dopo l'ultima lettura (con un'ora di margine)", () => {
  assert.equal(lostRange(null, at(10)), null, "prima lettura: niente da perdere");
  assert.equal(lostRange(at(10), at(10, 30)), null);
  assert.equal(lostRange(at(10), undefined), null);
  assert.deepEqual(lostRange(at(10, 0, 5), at(0, 0, 8)), { from: at(10, 0, 5), to: at(0, 0, 8) });
});

console.log(`screentime android: ${passed} prove passate`);
