/*
 * Prove del report per materie: proposta degli abbinamenti e righe da mandare (funzioni pure, nessun server).
 * Lancio (da questa cartella del repo):
 *   npx rolldown scripts/gruppi/subjects.test.mts --file node_modules/.tmp/gruppi-subjects.test.mjs --platform node
 *   node node_modules/.tmp/gruppi-subjects.test.mjs
 */
import assert from "node:assert/strict";
import {
  baseWords,
  proposeGroupSubject,
  similarity,
  subjectKey,
  suggestedGroupSubjectName,
} from "../../src/social/modules/study/subjects/match";
import { groupSubjectRows, resolveGroupSubject, type GroupSubjectRef } from "../../src/social/modules/study/subjects/subjectPlan";
import type { SubjectPending } from "../../src/social/modules/study/data/subjectLinksRepository";
import { syncGroupSubjects, type GroupSubjectInfo, type SubjectSyncDeps } from "../../src/social/modules/study/subjects/subjectSync";
import type { SubjectLink } from "../../src/social/modules/study/subjects/subjectPlan";
import { syncDays, type LocalDay } from "../../src/social/modules/study/sync/plan";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

const group = [
  { id: "analisi", name: "Analisi" },
  { id: "fisica", name: "Fisica" },
  { id: "elettronica", name: "Elettronica" },
  { id: "letteratura", name: "Letteratura" },
];
const propose = (name: string, subjects = group) => proposeGroupSubject(name, subjects)?.id ?? null;

test("normalizzazione: minuscole, accenti, punteggiatura, spazi", () => {
  assert.equal(subjectKey("  Àrte,   Moderna!! "), "arte moderna");
  assert.equal(subjectKey("Fisica  II."), "fisica ii");
  assert.equal(subjectKey("analisi1"), "analisi 1");
  assert.deepEqual(baseWords("Analisi 2"), ["analisi"]);
  assert.deepEqual(baseWords("Fisica III"), ["fisica"]);
  assert.deepEqual(baseWords("XX"), ["xx"], "resta almeno una parola");
});

test("casi della richiesta", () => {
  assert.equal(propose("Analisi 2"), "analisi");
  assert.equal(propose("analisi1"), "analisi");
  assert.equal(propose("Fisica I"), "fisica");
  assert.equal(propose("Inglese"), null);
});

test("di base si unisce: parole in più (da confermare a mano)", () => {
  assert.equal(proposeGroupSubject("Fisica tecnica", group)?.rule, "extra-words");
  assert.equal(propose("Fisica tecnica"), "fisica");
  assert.equal(propose("Letteratura italiana"), "letteratura");
  assert.equal(propose("Analisi matematica 2"), "analisi");
});

test("stesso nome con i numeri: vince su quello senza", () => {
  const subjects = [...group, { id: "fisica2", name: "Fisica II" }];
  assert.equal(propose("fisica ii", subjects), "fisica2");
  assert.equal(propose("Fisica 1", subjects), "fisica", "senza numeri uguale: va su quella senza numero");
});

test("a parità nessuna proposta", () => {
  const subjects = [
    { id: "f1", name: "Fisica I" },
    { id: "f2", name: "Fisica II" },
  ];
  assert.equal(propose("Fisica III", subjects), null);
  assert.equal(propose("Fisica", subjects), null);
});

test("errori di battitura", () => {
  assert.ok(similarity("anlaisi", "analisi") >= 0.8);
  assert.ok(similarity("elettronica", "elettrotecnica") < 0.8);
  assert.equal(propose("Anlaisi"), "analisi");
  assert.equal(proposeGroupSubject("Elettrotecnica", group), null, "parole diverse, non un errore di battitura");
  assert.equal(propose("Fisca"), "fisica");
  assert.equal(propose("Arte", [{ id: "arti", name: "Arti" }]), null, "nomi corti: solo uguali");
});

test("nome vuoto o di sola punteggiatura", () => {
  assert.equal(propose("  "), null);
  assert.equal(propose("!!"), null);
});

test("nome proposto per una nuova materia del gruppo", () => {
  assert.equal(suggestedGroupSubjectName("Analisi 2"), "Analisi");
  assert.equal(suggestedGroupSubjectName("analisi1"), "analisi");
  assert.equal(suggestedGroupSubjectName("Fisica II"), "Fisica");
  assert.equal(suggestedGroupSubjectName("Storia dell'arte"), "Storia dell'arte");
  assert.equal(suggestedGroupSubjectName("  Inglese  "), "Inglese");
  assert.equal(suggestedGroupSubjectName("x".repeat(50)).length, 40);
});

const day = (key: string, start: number): LocalDay => ({ key, start, end: start + 86_400_000 });
const days = [day("2026-10-26", 0), day("2026-10-27", 86_400_000)];

test("righe: somma per materia del gruppo, solo abbinate, niente zeri", () => {
  const links = new Map<number, string>([
    [1, "analisi"],
    [2, "analisi"],
    [3, "fisica"],
  ]);
  const rows = groupSubjectRows(
    days,
    [
      { endedAt: 1000, durationSeconds: 1800, subjectId: 1 },
      { endedAt: 2000, durationSeconds: 1200, subjectId: 2 },
      { endedAt: 3000, durationSeconds: 900, subjectId: 4 }, // non abbinata: "Altre materie"
      { endedAt: 86_400_000 + 5, durationSeconds: 600.4, subjectId: 3 },
      { endedAt: 3 * 86_400_000, durationSeconds: 600, subjectId: 1 }, // fuori dai giorni
    ],
    links
  );
  assert.deepEqual(rows, [
    { subjectId: "analisi", day: "2026-10-26", seconds: 3000 },
    { subjectId: "fisica", day: "2026-10-27", seconds: 600 },
  ]);
});

test("righe: oltre 86400 s si riducono in proporzione", () => {
  const rows = groupSubjectRows(
    [days[0]],
    [
      { endedAt: 1, durationSeconds: 60_000, subjectId: 1 },
      { endedAt: 2, durationSeconds: 60_000, subjectId: 2 },
    ],
    new Map([
      [1, "a"],
      [2, "b"],
    ])
  );
  assert.ok(rows.reduce((s, r) => s + r.seconds, 0) <= 86_400);
  assert.equal(rows[0].seconds, 43_200);
});

test("unioni: l'abbinamento segue la materia unita", () => {
  const subjects = new Map<string, GroupSubjectRef>([
    ["a", { id: "a", mergedInto: "b" }],
    ["b", { id: "b", mergedInto: "c" }],
    ["c", { id: "c", mergedInto: null }],
    ["x", { id: "x", mergedInto: "y" }],
    ["y", { id: "y", mergedInto: "x" }],
  ]);
  assert.equal(resolveGroupSubject("a", subjects), "c");
  assert.equal(resolveGroupSubject("c", subjects), "c");
  assert.equal(resolveGroupSubject("eliminata", subjects), null);
  assert.equal(resolveGroupSubject("x", subjects), null, "un giro chiuso non blocca");
});

// ─── Giro di sincronizzazione, con un server finto ───

interface Fake {
  deps: SubjectSyncDeps;
  log: string[];
  pending: SubjectPending;
  links: SubjectLink[];
}

function fake(options: {
  consent?: boolean;
  groups?: string[] | null;
  pending?: Partial<SubjectPending>;
  links?: SubjectLink[];
  subjects?: GroupSubjectInfo[];
  deviceDays?: string[];
  disabled?: boolean;
}): Fake {
  const nowMs = new Date(2026, 9, 27, 18).getTime();
  const f: Fake = {
    log: [],
    pending: { revoke: [], backfillAt: null, ...options.pending },
    links: options.links ?? [],
    deps: undefined as unknown as SubjectSyncDeps,
  };
  f.deps = {
    now: () => nowMs,
    consentEnabled: () => options.consent ?? true,
    groupIds: () => (options.groups === undefined ? ["g"] : options.groups),
    updatePending: async (change) => (f.pending = change(f.pending)),
    pushConsent: async (enabled) => void f.log.push(`consenso ${enabled}`),
    revoke: async (groupId, subjectId) => void f.log.push(`revoca ${groupId}/${subjectId}`),
    fetchSubjects: async () => options.subjects ?? [{ id: "analisi", groupId: "g", mergedInto: null }],
    loadLinks: async () => f.links.map((l) => ({ ...l })),
    retargetLinks: async (groupId, fromId, toId) => {
      f.log.push(`segue ${fromId}->${toId}`);
      for (const l of f.links) if (l.groupId === groupId && l.groupSubjectId === fromId) l.groupSubjectId = toId;
    },
    dropLinksTo: async (groupId, subjectId) => {
      f.log.push(`via ${subjectId}`);
      f.links = f.links.filter((l) => !(l.groupId === groupId && l.groupSubjectId === subjectId));
    },
    dropGroupLinks: async (groupId) => {
      f.log.push(`via gruppo ${groupId}`);
      f.links = f.links.filter((l) => l.groupId !== groupId);
    },
    fetchDeviceDays: async () => options.deviceDays ?? [],
    // una sessione di 10 minuti della materia locale 1 in ogni giorno richiesto
    loadSessions: async () =>
      syncDays(new Date(nowMs), null, 60).map((d) => ({ endedAt: d.start + 1000, durationSeconds: 600, subjectId: 1 })),
    uploadDaily: async (totals) => void f.log.push(`giornalieri ${totals.length}`),
    upload: async (groupId, days, rows) => {
      f.log.push(`invio ${groupId} ${days.length} giorni ${rows.length} righe`);
      return options.disabled ? "disabled" : "ok";
    },
    onDisabledByServer: () => void f.log.push("spento dal server"),
  };
  return f;
}

const now = new Date(2026, 9, 27, 18);
const recent = syncDays(now, now.getTime() - 3_600_000); // ieri e oggi
const link = (groupSubjectId: string | null, groupId = "g"): SubjectLink => ({ groupId, localSubjectId: 1, groupSubjectId });

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

await testAsync("giro: prima consenso e revoche, poi le righe", async () => {
  const f = fake({ pending: { consent: true, revoke: [{ groupId: "g", subjectId: "fisica" }] }, links: [link("analisi")] });
  await syncGroupSubjects(f.deps, recent);
  assert.deepEqual(f.log, ["consenso true", "revoca g/fisica", "invio g 2 giorni 2 righe"]);
  assert.equal(f.pending.consent, undefined);
  assert.deepEqual(f.pending.revoke, []);
});

await testAsync("giro: consenso spento, si manda il no e nient'altro", async () => {
  const f = fake({ consent: false, pending: { consent: false }, links: [link("analisi")] });
  await syncGroupSubjects(f.deps, recent);
  assert.deepEqual(f.log, ["consenso false"]);
});

await testAsync("giro: gruppi non ancora letti, non si tocca niente", async () => {
  const f = fake({ groups: null, links: [link("analisi")] });
  await syncGroupSubjects(f.deps, recent);
  assert.deepEqual(f.log, []);
  assert.equal(f.links.length, 1);
});

await testAsync("giro: l'abbinamento segue la materia unita; quello a una eliminata cade", async () => {
  const f = fake({
    links: [link("vecchia"), { groupId: "g", localSubjectId: 2, groupSubjectId: "eliminata" }],
    subjects: [
      { id: "vecchia", groupId: "g", mergedInto: "analisi" },
      { id: "analisi", groupId: "g", mergedInto: null },
    ],
  });
  await syncGroupSubjects(f.deps, recent);
  assert.deepEqual(f.log, ["segue vecchia->analisi", "via eliminata", "invio g 2 giorni 2 righe"]);
});

await testAsync("giro: fuori dal gruppo gli abbinamenti si tolgono", async () => {
  const f = fake({ groups: [], links: [link("analisi")] });
  await syncGroupSubjects(f.deps, recent);
  assert.deepEqual(f.log, ["via gruppo g"]);
});

await testAsync("giro: lo storico solo sui giorni già sul server, poi si toglie", async () => {
  const f = fake({ pending: { backfillAt: 5 }, links: [link("analisi")], deviceDays: ["2026-10-01", "2026-10-02", "2026-10-27"] });
  await syncGroupSubjects(f.deps, recent);
  assert.deepEqual(f.log, ["giornalieri 2", "invio g 4 giorni 4 righe"]);
  assert.equal(f.pending.backfillAt, null);
});

await testAsync("giro: lo storico non si toglie se nel frattempo cambia un altro abbinamento", async () => {
  const f = fake({ pending: { backfillAt: 5 }, links: [link("analisi")] });
  const upload = f.deps.upload;
  f.deps.upload = async (...args) => {
    f.pending = { ...f.pending, backfillAt: 9 };
    return upload(...args);
  };
  await syncGroupSubjects(f.deps, recent);
  assert.equal(f.pending.backfillAt, 9);
});

await testAsync("giro: il server dice che il consenso è spento (altro dispositivo)", async () => {
  const f = fake({ links: [link("analisi")], disabled: true });
  await syncGroupSubjects(f.deps, recent);
  assert.deepEqual(f.log, ["invio g 2 giorni 2 righe", "spento dal server"]);
});

console.log(`\nOK: ${passed} prove superate`);
