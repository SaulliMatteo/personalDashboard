/*
 * Prove dei consigli YouTube (widgets/youtube/lib/recommender.ts): video abbandonato, filtri, rinvii, tutti rinviati,
 * durata ignota, dati assenti, serie, fasce orarie, stabilità della scelta, determinismo, motivo. Funzioni pure.
 * Lancio (dalla cartella del repo):
 *   npx rolldown scripts/youtube/recommender.test.mts --file node_modules/.tmp/youtube-recommender.test.mjs --platform node
 *   node node_modules/.tmp/youtube-recommender.test.mjs
 */
process.env.TZ = "Europe/Rome";

import assert from "node:assert/strict";
import type { SavedVideo, VideoFeedback, VideoFolder, WatchSegment } from "../../src/widgets/youtube/data/youtubeRepository";
import {
  agoText,
  bandOf,
  chooseSuggestion,
  describeReason,
  episodeNumber,
  groupSittings,
  parseSavedChoice,
  pickFromRanking,
  rankVideos,
  snoozeDays,
  snoozeUntil,
  type RecommenderInput,
} from "../../src/widgets/youtube/lib/recommender";

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

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
// Lunedì 2 novembre 2026 alle 10:00 (mattina).
const now = new Date(2026, 10, 2, 10, 0).getTime();

let nextId = 1;
function video(over: Partial<SavedVideo> = {}): SavedVideo {
  const id = over.id ?? nextId++;
  return {
    id,
    youtubeId: `yt${String(id).padStart(9, "0")}`,
    title: `Video ${id}`,
    channel: "",
    thumbnailUrl: null,
    durationSeconds: null,
    folderId: null,
    position: 0,
    watched: false,
    positionSeconds: 0,
    createdAt: now - 2 * DAY,
    lastWatchedAt: null,
    ...over,
  };
}

function input(videos: SavedVideo[], over: Partial<RecommenderInput> = {}): RecommenderInput {
  return {
    videos,
    folders: [],
    noteCounts: new Map(),
    watchedSeconds: new Map(),
    segments: [],
    feedback: new Map(),
    channelDismissals: new Map(),
    pendingDiscardIds: new Set(),
    now,
    ...over,
  };
}

function feedback(videoId: number, snoozeCount: number, snoozedUntil: number | null): VideoFeedback {
  return { videoId, snoozeCount, snoozedUntil, lastSuggestedAt: null };
}

const ids = (r: ReturnType<typeof rankVideos>) => r.items.map((i) => i.video.id);

await test("video abbandonato dopo pochi secondi non blocca gli altri", () => {
  // Il vecchio comportamento proponeva sempre l'ultimo iniziato: qui è stato aperto 20 giorni fa e fermo al 1%.
  const abandoned = video({ durationSeconds: 1000, positionSeconds: 10, lastWatchedAt: now - 20 * DAY, createdAt: now - 30 * DAY });
  const fresh = video({ createdAt: now - 3 * DAY });
  const ranking = rankVideos(input([abandoned, fresh]));
  assert.deepEqual(ids(ranking), [fresh.id, abandoned.id]);
  assert.equal(ranking.items[1].signals.abbandono.value, -1);
  // Iniziato da poco ma sotto il 5%: niente bonus "in corso", nessuna precedenza automatica.
  const barely = video({ durationSeconds: 1000, positionSeconds: 20, lastWatchedAt: now - DAY });
  assert.equal(rankVideos(input([barely])).items[0].signals.inCorso.value, 0);
});

await test("in corso: bonus solo se recente e oltre il 5%", () => {
  const started = video({ durationSeconds: 1000, positionSeconds: 400, lastWatchedAt: now - DAY, createdAt: now - 100 * DAY });
  const forgotten = video({ createdAt: now - 100 * DAY });
  const ranking = rankVideos(input([forgotten, started]));
  assert.equal(ranking.items[0].video.id, started.id);
  assert.equal(ranking.items[0].signals.inCorso.value, 1);
  const old = video({ durationSeconds: 1000, positionSeconds: 400, lastWatchedAt: now - 5 * DAY });
  assert.equal(rankVideos(input([old])).items[0].signals.inCorso.value, 0);
});

await test("filtri: guardati, in attesa di scarto e rinviati esclusi", () => {
  const watched = video({ watched: true });
  const discarding = video();
  const snoozed = video();
  const ok = video();
  const ranking = rankVideos(
    input([watched, discarding, snoozed, ok], {
      pendingDiscardIds: new Set([discarding.id]),
      feedback: new Map([[snoozed.id, feedback(snoozed.id, 1, now + DAY)]]),
    })
  );
  assert.deepEqual(ids(ranking), [ok.id]);
  assert.equal(ranking.fallback, null);
  // Un rinvio scaduto non nasconde più il video, ma la penalità resta.
  const expired = rankVideos(input([snoozed], { feedback: new Map([[snoozed.id, feedback(snoozed.id, 2, now - DAY)]]) }));
  assert.equal(expired.items.length, 1);
  assert.equal(expired.fallback, null);
  assert.equal(expired.items[0].signals.rinvii.value, -0.5);
});

await test("rinvii: 3 giorni × 2^(n-1), al massimo 60", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map(snoozeDays), [3, 6, 12, 24, 48, 60, 60, 60]);
  assert.equal(snoozeUntil(1, now), now + 3 * DAY);
  assert.equal(snoozeDays(0), 3);
});

await test("tutti rinviati: si propone quello che scade prima", () => {
  const a = video();
  const b = video();
  const c = video();
  const ranking = rankVideos(
    input([a, b, c], {
      feedback: new Map([
        [a.id, feedback(a.id, 1, now + 5 * DAY)],
        [b.id, feedback(b.id, 2, now + 1 * DAY)],
        [c.id, feedback(c.id, 1, now + 3 * DAY)],
      ]),
    })
  );
  assert.equal(ranking.fallback, "snoozed");
  assert.deepEqual(ids(ranking), [b.id, c.id, a.id]);
  assert.equal(pickFromRanking(ranking, () => 0.99)?.video.id, b.id);
  assert.equal(describeReason(ranking.items[0], ranking), "Gli altri video sono tutti rinviati");
  // Guardati e in attesa di scarto restano fuori anche così.
  assert.equal(rankVideos(input([video({ watched: true })])).items.length, 0);
});

await test("durata ignota e dati assenti: segnali neutri, nessun errore", () => {
  const v = video({ positionSeconds: 300, lastWatchedAt: now - 30 * DAY });
  const item = rankVideos(input([v])).items[0];
  assert.equal(item.signals.inCorso.value, 0);
  assert.equal(item.signals.abbandono.value, 0);
  assert.equal(item.signals.tempo.value, 0);
  assert.equal(item.signals.interesse.value, 0);
  assert.equal(item.signals.preferenze.value, 0);
  assert.equal(item.signals.varieta.value, 0); // è lui l'ultimo guardato
  assert.ok(Number.isFinite(item.score));
  assert.equal(rankVideos(input([])).items.length, 0);
  assert.equal(pickFromRanking(rankVideos(input([])), () => 0), null);
});

await test("interesse: note e tempo guardato", () => {
  const withNotes = video();
  const plain = video();
  const ranking = rankVideos(
    input([plain, withNotes], { noteCounts: new Map([[withNotes.id, 3]]), watchedSeconds: new Map([[withNotes.id, 600]]) })
  );
  assert.equal(ranking.items[0].video.id, withNotes.id);
  assert.equal(ranking.items[0].signals.interesse.value, 1);
});

await test("serie: bonus se il precedente è guardato, penalità solo con numerazione", () => {
  const folders: VideoFolder[] = [{ id: 7, parentId: null, name: "Analisi", color: null, createdAt: 0 }];
  const p1 = video({ folderId: 7, position: 0, title: "Analisi - Lezione 1", watched: true });
  const p2 = video({ folderId: 7, position: 1, title: "Analisi - Lezione 2" });
  const r = rankVideos(input([p1, p2], { folders })).items[0];
  assert.equal(r.signals.serie.value, 1);
  assert.equal(describeReason(r, { fallback: null }).includes("«Analisi»"), true);

  // Parte 3 con la parte 2 non guardata: penalità.
  const q1 = video({ folderId: 7, position: 0, title: "Corso parte 1", watched: true });
  const q2 = video({ folderId: 7, position: 1, title: "Corso parte 2" });
  const q3 = video({ folderId: 7, position: 2, title: "Corso parte 3" });
  const ranking = rankVideos(input([q1, q2, q3], { folders }));
  const byId = new Map(ranking.items.map((i) => [i.video.id, i]));
  assert.equal(byId.get(q2.id)?.signals.serie.value, 1);
  assert.equal(byId.get(q3.id)?.signals.serie.value, -1);
  assert.equal(ranking.items[0].video.id, q2.id);

  // Senza numerazione nessuna penalità, anche se i precedenti non sono guardati.
  const n1 = video({ folderId: 7, position: 0, title: "Introduzione" });
  const n2 = video({ folderId: 7, position: 1, title: "Approfondimento" });
  const free = rankVideos(input([n1, n2], { folders }));
  assert.ok(free.items.every((i) => i.signals.serie.value === 0));

  assert.equal(episodeNumber("Fisica 2 - Ep. 12"), 12);
  assert.equal(episodeNumber("Lez.4 integrali"), 4);
  assert.equal(episodeNumber("Lezione"), null);
  assert.equal(episodeNumber("Apartment tour 3"), null);
});

await test("varietà: penalità per stesso canale o cartella dell'ultimo guardato", () => {
  // `last` sta DOPO `same` nella cartella: altrimenti il bonus Serie compenserebbe la penalità.
  const last = video({ channel: "Canale A", folderId: 1, position: 5, watched: true, lastWatchedAt: now - MIN });
  const same = video({ channel: "Canale A", folderId: 1, position: 0 });
  const other = video({ channel: "Canale B", folderId: 2 });
  const ranking = rankVideos(input([last, same, other]));
  const byId = new Map(ranking.items.map((i) => [i.video.id, i]));
  assert.equal(byId.get(same.id)?.signals.varieta.value, -1);
  assert.equal(byId.get(other.id)?.signals.varieta.value, 0);
  assert.equal(ranking.items[0].video.id, other.id);
});

await test("preferenze: neutre sotto 5 casi, scarti contati come abbandoni", () => {
  const finished = Array.from({ length: 4 }, () => video({ channel: "Bravo", watched: true }));
  const candidate = video({ channel: "Bravo" });
  const few = rankVideos(input([...finished, candidate])).items[0];
  assert.equal(few.signals.preferenze.value, 0);
  const more = [...finished, video({ channel: "Bravo", watched: true }), candidate];
  const enough = rankVideos(input(more)).items[0];
  assert.ok(enough.signals.preferenze.value > 0);
  // 5 finiti e 10 scarti: il canale diventa sfavorito.
  const dismissed = rankVideos(input(more, { channelDismissals: new Map([["Bravo", 10]]) })).items[0];
  assert.ok(dismissed.signals.preferenze.value < 0);
});

await test("fasce e sessioni: segmenti uniti, soglia di 10 sessioni", () => {
  assert.equal(bandOf(new Date(2026, 10, 2, 6, 0).getTime()), "mattina");
  assert.equal(bandOf(new Date(2026, 10, 2, 12, 0).getTime()), "pomeriggio");
  assert.equal(bandOf(new Date(2026, 10, 2, 18, 0).getTime()), "sera");
  assert.equal(bandOf(new Date(2026, 10, 2, 23, 0).getTime()), "notte");
  assert.equal(bandOf(new Date(2026, 10, 2, 5, 59).getTime()), "notte");

  // Tre segmenti contigui dello stesso video = una sessione; dopo 10 minuti di pausa, una nuova.
  const t0 = new Date(2026, 10, 1, 9, 0).getTime();
  const segs: WatchSegment[] = [
    { videoId: 1, startedAt: t0, endedAt: t0 + 30_000, seconds: 30 },
    { videoId: 1, startedAt: t0 + 30_000, endedAt: t0 + 60_000, seconds: 30 },
    { videoId: 2, startedAt: t0 + 40_000, endedAt: t0 + 70_000, seconds: 30 },
    { videoId: 1, startedAt: t0 + 60_000, endedAt: t0 + 90_000, seconds: 30 },
    { videoId: 1, startedAt: t0 + 11 * MIN, endedAt: t0 + 11 * MIN + 20_000, seconds: 20 },
  ];
  const sittings = groupSittings(segs);
  assert.deepEqual(
    sittings.map((s) => [s.videoId, s.seconds]),
    [
      [1, 90],
      [2, 30],
      [1, 20],
    ]
  );

  // Sessioni della mattina da 10 minuti: un video con 8 minuti residui va bene, uno da 60 no.
  const morning = (n: number): WatchSegment[] =>
    Array.from({ length: n }, (_, i) => {
      const start = new Date(2026, 9, 1 + i, 9, 0).getTime();
      return { videoId: 100 + i, startedAt: start, endedAt: start + 10 * MIN, seconds: 600 };
    });
  const short = video({ durationSeconds: 480 });
  const long = video({ durationSeconds: 3600 });
  const unknown = video();
  const r9 = rankVideos(input([short, long, unknown], { segments: morning(9) }));
  assert.ok(r9.items.every((i) => i.signals.tempo.value === 0)); // meno di 10 sessioni: neutro
  const r10 = rankVideos(input([short, long, unknown], { segments: morning(10) }));
  const byId = new Map(r10.items.map((i) => [i.video.id, i]));
  assert.equal(byId.get(short.id)?.signals.tempo.value, 1);
  assert.equal(byId.get(long.id)?.signals.tempo.value, -1);
  assert.equal(byId.get(unknown.id)?.signals.tempo.value, 0);
  // Le sessioni della sera non contano di mattina.
  const evening = morning(12).map((s) => ({ ...s, startedAt: s.startedAt + 10 * 60 * MIN, endedAt: s.endedAt + 10 * 60 * MIN }));
  assert.ok(rankVideos(input([short], { segments: evening })).items.every((i) => i.signals.tempo.value === 0));
});

await test("scelta: tra i migliori entro il 15%, deterministica con random iniettato", () => {
  const a = video({ createdAt: now - 100 * DAY });
  const b = video({ createdAt: now - 95 * DAY });
  const c = video({ createdAt: now - 90 * DAY });
  const d = video({ createdAt: now - 1 * DAY });
  const ranking = rankVideos(input([a, b, c, d]));
  const picks = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.999].map((r) => pickFromRanking(ranking, () => r)?.video.id));
  assert.ok(!picks.has(d.id)); // troppo lontano dal migliore
  assert.ok(picks.size >= 2);
  for (const r of [0, 0.37, 0.99]) {
    assert.equal(pickFromRanking(ranking, () => r)?.video.id, pickFromRanking(ranking, () => r)?.video.id);
  }
  assert.equal(pickFromRanking(ranking, () => 0)?.video.id, ranking.items[0].video.id);
});

await test("stabilità: resta finché non cambia la fascia, salvo video iniziato in quella fascia", () => {
  const a = video({ createdAt: now - 100 * DAY });
  const b = video({ createdAt: now - 99 * DAY });
  const ranking = rankVideos(input([a, b]));
  const first = chooseSuggestion(null, ranking, now, () => 0);
  assert.equal(first.changed, true);
  assert.ok(first.choice);
  const saved = first.choice!;
  assert.equal(saved.band, "mattina");

  // Stessa fascia: anche con un random diverso resta lo stesso video.
  const again = chooseSuggestion(saved, ranking, now + 30 * MIN, () => 0.99);
  assert.equal(again.pick?.video.id, saved.videoId);
  assert.equal(again.changed, false);

  // Fascia cambiata (pomeriggio): si estrae di nuovo.
  const afternoon = new Date(2026, 10, 2, 14, 0).getTime();
  const later = rankVideos(input([a, b], { now: afternoon }));
  const moved = chooseSuggestion(saved, later, afternoon, () => 0.99);
  assert.equal(moved.changed, true);
  assert.equal(moved.choice?.band, "pomeriggio");

  // ...salvo se il video scelto è stato iniziato in quella fascia, dopo la scelta.
  const chosen = saved.videoId === a.id ? a : b;
  const startedMorning = { ...chosen, lastWatchedAt: now + 20 * MIN, positionSeconds: 60 };
  const others = [a, b].filter((v) => v.id !== chosen.id);
  const kept = chooseSuggestion(saved, rankVideos(input([startedMorning, ...others], { now: afternoon })), afternoon, () => 0.99);
  assert.equal(kept.pick?.video.id, chosen.id);
  assert.equal(kept.changed, false);

  // Guardato, rinviato, scartato o eliminato: si cambia.
  const watchedNow = rankVideos(input([{ ...chosen, watched: true }, ...others]));
  assert.notEqual(chooseSuggestion(saved, watchedNow, now, () => 0).pick?.video.id, chosen.id);
  const snoozedNow = rankVideos(input([chosen, ...others], { feedback: new Map([[chosen.id, feedback(chosen.id, 1, now + DAY)]]) }));
  assert.notEqual(chooseSuggestion(saved, snoozedNow, now, () => 0).pick?.video.id, chosen.id);
  const discarding = rankVideos(input([chosen, ...others], { pendingDiscardIds: new Set([chosen.id]) }));
  assert.notEqual(chooseSuggestion(saved, discarding, now, () => 0).pick?.video.id, chosen.id);
  const deleted = rankVideos(input(others));
  const afterDelete = chooseSuggestion(saved, deleted, now, () => 0);
  assert.equal(afterDelete.pick?.video.id, others[0].id);
  assert.equal(afterDelete.changed, true);

  // Niente da proporre.
  const none = chooseSuggestion(saved, rankVideos(input([])), now, () => 0);
  assert.equal(none.pick, null);
});

await test("scelta salvata: lettura tollerante", () => {
  assert.deepEqual(parseSavedChoice('{"videoId":3,"band":"sera","chosenAt":5}'), { videoId: 3, band: "sera", chosenAt: 5 });
  assert.equal(parseSavedChoice(null), null);
  assert.equal(parseSavedChoice("rotto"), null);
  assert.equal(parseSavedChoice('{"videoId":3,"band":"alba","chosenAt":5}'), null);
});

await test("motivo: dal segnale più forte, solo dati reali", () => {
  const old = video({ createdAt: now - 150 * DAY });
  const r = rankVideos(input([old], { noteCounts: new Map([[old.id, 3]]) }));
  assert.equal(describeReason(r.items[0], r), "Salvato 5 mesi fa, con 3 note");

  const started = video({ durationSeconds: 1000, positionSeconds: 400, lastWatchedAt: now - DAY - MIN });
  const rs = rankVideos(input([started]));
  assert.equal(describeReason(rs.items[0], rs), "Iniziato ieri, sei al 40%");

  const snoozed = video({ createdAt: now - 150 * DAY });
  const rz = rankVideos(input([snoozed], { feedback: new Map([[snoozed.id, feedback(snoozed.id, 3, now - DAY)]]) }));
  assert.equal(describeReason(rz.items[0], rz), "Rinviato 3 volte: se non ti interessa più, scartalo");

  // Salvato adesso, nessun segnale positivo: la data.
  const brandNew = video({ createdAt: now });
  const rn = rankVideos(input([brandNew]));
  assert.equal(describeReason(rn.items[0], rn), "Salvato il 2 novembre");

  assert.deepEqual([0.5, 1, 5, 20, 70, 400, 800].map(agoText), [
    "oggi",
    "ieri",
    "5 giorni fa",
    "2 settimane fa",
    "2 mesi fa",
    "un anno fa",
    "2 anni fa",
  ]);
});

console.log(`ok: ${passed} prove superate`);
