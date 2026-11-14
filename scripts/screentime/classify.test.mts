/*
 * Prove della classificazione dei segmenti (widgets/screentime/lib/classify.ts): app, dashboard, schermo bloccato,
 * inattività che conta solo per video/musica/chiamate, browser sempre "Browser" senza siti, scelte a mano, nomi.
 * Lancio (dalla cartella del repo):
 *   npx rolldown scripts/screentime/classify.test.mts --file node_modules/.tmp/st-classify.test.mjs --platform node
 *   node node_modules/.tmp/st-classify.test.mjs
 */
import assert from "node:assert/strict";
import { SELF_KEY, classifySegment, effectiveCategory, type RawSegment } from "../../src/widgets/screentime/lib/classify";
import { appDisplayName } from "../../src/widgets/screentime/lib/appName";

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

const seg = (over: Partial<RawSegment>): RawSegment => ({
  startMs: 0,
  endMs: 60_000,
  process: "C:\\Programmi\\Microsoft VS Code\\Code.exe",
  description: "Visual Studio Code",
  title: "app.ts - personalDashboard - Visual Studio Code",
  isSelf: false,
  idle: false,
  ...over,
});

test("classificazione: app, dashboard, schermo bloccato", () => {
  const code = classifySegment(seg({}));
  assert.equal(code.appKey, "code");
  assert.equal(code.appLabel, "VS Code");
  assert.equal(code.category, "coding");
  assert.equal(code.counted, true);
  assert.ok(!("title" in code), "il titolo non esce dalla classificazione");

  const self = classifySegment(seg({ isSelf: true, process: "C:\\x\\app.exe" }));
  assert.equal(self.appKey, SELF_KEY);

  const lock = classifySegment(seg({ process: "C:\\Windows\\LockApp.exe", description: "", title: "" }));
  assert.equal(lock.counted, false);
});

test("inattivo: conta solo video, musica e chiamate", () => {
  assert.equal(classifySegment(seg({ idle: true })).counted, false);
  assert.equal(classifySegment(seg({ idle: true, process: "C:\\x\\vlc.exe", description: "VLC media player", title: "Film.mkv - VLC media player" })).counted, true);
  assert.equal(classifySegment(seg({ idle: true, process: "C:\\x\\Zoom.exe", description: "Zoom", title: "Riunione" })).counted, true);
  assert.equal(classifySegment(seg({ idle: true, process: "C:\\x\\chrome.exe", title: "Articolo - Wikipedia - Google Chrome" })).counted, false);
});

test("i browser contano come app, sempre Browser, senza sito", () => {
  for (const [process, label] of [["C:\\x\\opera.exe", /^Opera/], ["C:\\x\\opera_gx.exe", /^Opera/], ["C:\\x\\chrome.exe", /Chrome/], ["C:\\x\\msedge.exe", /Edge/], ["C:\\x\\firefox.exe", /Firefox/]] as const) {
    const yt = classifySegment(seg({ process, description: "", title: "Video - YouTube - Browser" }));
    assert.ok(!("site" in yt), "niente sito");
    assert.equal(yt.category, "browser");
    assert.match(yt.appLabel, label);
    assert.equal(yt.counted, true);
    // un video nel browser senza toccare nulla non conta più
    assert.equal(classifySegment(seg({ process, description: "", title: "Video - YouTube - Browser", idle: true })).counted, false);
  }
});

test("scelte a mano: valgono per l'app, anche nei giorni salvati", () => {
  const manual = new Map([["chrome", "office" as const]]);
  assert.equal(effectiveCategory({ appKey: "chrome", category: "browser" }, manual), "office");
  assert.equal(effectiveCategory({ appKey: "firefox", category: "browser" }, manual), "browser");
});

test("nomi delle app", () => {
  assert.equal(appDisplayName("opera", "Opera Internet Browser"), "Opera");
  assert.equal(appDisplayName("strano", "Strano Launcher"), "Strano");
  assert.equal(appDisplayName("nessuno", ""), "Nessuno");
  assert.equal(appDisplayName("", ""), "App sconosciuta");
});

console.log(`classify: ${passed} prove passate`);
