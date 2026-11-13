/*
 * Prove del sito ricavato dal titolo della scheda (widgets/screentime/lib/siteFromTitle.ts) e della classificazione
 * dei segmenti (lib/classify.ts): browser diversi, profilo di Edge, siti noti in mezzo al titolo, nomi sconosciuti,
 * pagine vuote, categoria del sito, inattività che conta solo per video/musica/chiamate. Lancio (dalla cartella del repo):
 *   npx rolldown scripts/screentime/siteFromTitle.test.mts --file node_modules/.tmp/st-site.test.mjs --platform node
 *   node node_modules/.tmp/st-site.test.mjs
 */
import assert from "node:assert/strict";
import { OTHER_SITE, cleanBrowserTitle, siteFromTitle } from "../../src/widgets/screentime/lib/siteFromTitle";
import { SELF_KEY, classifySegment, effectiveCategory, siteChoiceKey, type RawSegment } from "../../src/widgets/screentime/lib/classify";
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

const ZW = String.fromCharCode(0x200b);

test("via il nome del browser", () => {
  assert.equal(cleanBrowserTitle("Pagina - Google Chrome", "chrome"), "Pagina");
  assert.equal(cleanBrowserTitle("Pagina — Mozilla Firefox", "firefox"), "Pagina");
  assert.equal(cleanBrowserTitle("Pagina - Opera", "opera"), "Pagina");
  assert.equal(cleanBrowserTitle(`Pagina - Microsoft${ZW} Edge`, "msedge"), "Pagina");
  assert.equal(cleanBrowserTitle(`Pagina - Personale - Microsoft${ZW} Edge`, "msedge"), "Pagina");
  assert.equal(cleanBrowserTitle("(3) Video - YouTube - Google Chrome", "chrome"), "Video - YouTube");
  assert.equal(cleanBrowserTitle("Pagina e altre 4 pagine - Microsoft Edge", "msedge"), "Pagina");
});

test("siti noti, anche con il loro nome in mezzo", () => {
  assert.deepEqual(siteFromTitle("Gatto che suona - YouTube - Google Chrome", "chrome"), { site: "YouTube", category: "video" });
  assert.deepEqual(siteFromTitle("Lo-fi beats - YouTube Music - Opera", "opera"), { site: "YouTube Music", category: "music" });
  assert.deepEqual(siteFromTitle("SaulliMatteo/personalDashboard: dashboard - GitHub - Google Chrome", "chrome"), { site: "GitHub", category: "coding" });
  assert.deepEqual(siteFromTitle("Posta in arrivo (12) - nome@esempio.it - Gmail - Google Chrome", "chrome"), { site: "Gmail", category: "office" });
  assert.deepEqual(siteFromTitle("ChatGPT - Opera", "opera"), { site: "ChatGPT", category: "chat" });
  assert.deepEqual(siteFromTitle("Instagram - Google Chrome", "chrome"), { site: "Instagram", category: "social" });
  assert.deepEqual(siteFromTitle('Mario su X: "ciao" / X - Google Chrome', "chrome"), { site: "X", category: "social" });
  assert.deepEqual(siteFromTitle("Reddit - Dive into anything - Mozilla Firefox", "firefox"), { site: "Reddit", category: "social" });
});

test("l'ultimo pezzo dice il sito, ma solo se è corto", () => {
  assert.deepEqual(siteFromTitle("Come installare Node - Aranzulla - Google Chrome", "chrome"), { site: "Aranzulla", category: null });
  assert.deepEqual(siteFromTitle("Documentazione | docs.rs - Google Chrome", "chrome"), { site: "docs.rs", category: null });
  assert.deepEqual(siteFromTitle("Un titolo lunghissimo senza separatori - Google Chrome", "chrome"), { site: OTHER_SITE, category: null });
  assert.deepEqual(siteFromTitle("Pagina - un pezzo finale troppo lungo per essere un sito - Google Chrome", "chrome"), { site: OTHER_SITE, category: null });
  assert.deepEqual(siteFromTitle("Nuova scheda - Google Chrome", "chrome"), { site: OTHER_SITE, category: null });
  assert.deepEqual(siteFromTitle("", "chrome"), { site: OTHER_SITE, category: null });
});

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

test("classificazione: app, sito, dashboard, schermo bloccato", () => {
  const code = classifySegment(seg({}));
  assert.equal(code.appKey, "code");
  assert.equal(code.appLabel, "VS Code");
  assert.equal(code.site, "");
  assert.equal(code.category, "coding");
  assert.equal(code.counted, true);
  assert.ok(!("title" in code), "il titolo non esce dalla classificazione");

  const yt = classifySegment(seg({ process: "C:\\x\\chrome.exe", description: "Google Chrome", title: "Video - YouTube - Google Chrome" }));
  assert.deepEqual([yt.appKey, yt.appLabel, yt.site, yt.category], ["chrome", "Chrome", "YouTube", "video"]);

  const self = classifySegment(seg({ isSelf: true, process: "C:\\x\\app.exe" }));
  assert.equal(self.appKey, SELF_KEY);

  const lock = classifySegment(seg({ process: "C:\\Windows\\LockApp.exe", description: "", title: "" }));
  assert.equal(lock.counted, false);
});

test("inattivo: conta solo video, musica e chiamate", () => {
  assert.equal(classifySegment(seg({ idle: true })).counted, false);
  assert.equal(classifySegment(seg({ idle: true, process: "C:\\x\\chrome.exe", title: "Film - YouTube - Google Chrome" })).counted, true);
  assert.equal(classifySegment(seg({ idle: true, process: "C:\\x\\Zoom.exe", description: "Zoom", title: "Riunione" })).counted, true);
  assert.equal(classifySegment(seg({ idle: true, process: "C:\\x\\chrome.exe", title: "Articolo - Wikipedia - Google Chrome" })).counted, false);
});

test("scelte a mano: per il sito vale quella del sito, per l'app quella dell'app", () => {
  const manual = new Map([
    ["chrome", "office" as const],
    [siteChoiceKey("YouTube"), "office" as const],
  ]);
  assert.equal(effectiveCategory({ appKey: "chrome", site: "YouTube", category: "video" }, manual), "office");
  assert.equal(effectiveCategory({ appKey: "chrome", site: "Twitch", category: "video" }, manual), "video");
  assert.equal(effectiveCategory({ appKey: "chrome", site: "", category: "browser" }, manual), "office");
  assert.equal(siteChoiceKey("A;b=c"), "web:abc");
});

test("nomi delle app", () => {
  assert.equal(appDisplayName("opera", "Opera Internet Browser"), "Opera");
  assert.equal(appDisplayName("strano", "Strano Launcher"), "Strano");
  assert.equal(appDisplayName("nessuno", ""), "Nessuno");
  assert.equal(appDisplayName("", ""), "App sconosciuta");
});

console.log(`siteFromTitle: ${passed} prove passate`);
