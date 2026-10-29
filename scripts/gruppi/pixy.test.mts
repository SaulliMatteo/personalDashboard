/*
 * Prove del modulo Pixy dei Gruppi: payload (privacy, validazione, orologio) e invii distanziati del hub generico.
 * Funzioni pure, nessun server. Lancio (da questa cartella del repo):
 *   npx rolldown scripts/gruppi/pixy.test.mts --file node_modules/.tmp/gruppi-pixy.test.mjs --platform node
 *   node node_modules/.tmp/gruppi-pixy.test.mjs
 */
import assert from "node:assert/strict";
import type { PresenceListeners } from "../../src/core/cloud/presence";
import { poseSnapshot } from "../../src/core/pixy/engine/poseSnapshot";
import type { BrainSnapshot } from "../../src/core/pixy/engine/snapshot";
import {
  buildPixyPresence,
  nextExpiry,
  parsePixyChannelState,
  parsePixyPresence,
  sharedToSnapshot,
  type PixyAppearance,
  type PixyPresence,
} from "../../src/social/modules/pixy/payload";
import { PresenceHub } from "../../src/social/presence/presenceHub";

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

const LOCAL = 1_800_000_000_000;
const OFFSET = 4_000; // il server è 4 s avanti
const SERVER = LOCAL + OFFSET;
const LOOK: PixyAppearance = { personality: "grumpy", color: "accent", showMouth: false };

function brainWithExtras(): BrainSnapshot {
  return {
    ...poseSnapshot("app_youtube", "grumpy"),
    costumeValue: 0.4567,
    reaction: { pose: null, emotion: "laugh", glyph: "star", motion: "bounce", startedAt: LOCAL - 500, until: LOCAL + 2500, priority: 2 },
    bubble: { id: 7, text: "Ancora un video?", until: LOCAL + 4000, durationMs: 4500, priority: 1 },
  };
}

await test("senza condivisione si manda solo l'aspetto", () => {
  const p = buildPixyPresence(LOOK, brainWithExtras(), { share: false, shareBubbles: true, offsetMs: OFFSET });
  assert.deepEqual(p, { v: 1, ...LOOK });
});

await test("con la condivisione ma senza Companion in uso: solo l'aspetto", () => {
  const p = buildPixyPresence(LOOK, null, { share: true, shareBubbles: true, offsetMs: OFFSET });
  assert.equal(p.brain, undefined);
});

await test("con la condivisione: posa e reazione in ora del server, niente fumetto senza il suo permesso", () => {
  const p = buildPixyPresence(LOOK, brainWithExtras(), { share: true, shareBubbles: false, offsetMs: OFFSET });
  assert.equal(p.brain?.pose, "app_youtube");
  assert.equal(p.brain?.costumeValue, 0.46, "la barra del video al centesimo");
  assert.equal(p.brain?.reaction?.startedAt, LOCAL - 500 + OFFSET);
  assert.equal(p.brain?.reaction?.until, LOCAL + 2500 + OFFSET);
  assert.equal(p.brain?.bubble, null);
  assert.equal("status" in (p.brain ?? {}), false, "lo stato a parole non si manda");
});

await test("con i fumetti: il fumetto parte, e torna uguale dopo la validazione", () => {
  const p = buildPixyPresence(LOOK, brainWithExtras(), { share: true, shareBubbles: true, offsetMs: OFFSET });
  assert.equal(p.brain?.bubble?.text, "Ancora un video?");
  const back = parsePixyPresence(JSON.parse(JSON.stringify(p)), SERVER);
  assert.deepEqual(back, p);
});

await test("versione sconosciuta o aspetto non valido: ignorato", () => {
  assert.equal(parsePixyPresence({ v: 2, ...LOOK }, SERVER), null);
  assert.equal(parsePixyPresence({ v: 1, ...LOOK, personality: "evil" }, SERVER), null);
  assert.equal(parsePixyPresence({ v: 1, ...LOOK, color: "#ff0000" }, SERVER), null);
  assert.equal(parsePixyPresence({ v: 1, ...LOOK, showMouth: "sì" }, SERVER), null);
  assert.equal(parsePixyPresence("ciao", SERVER), null);
  assert.equal(parsePixyPresence(null, SERVER), null);
});

await test("cervello non valido: si scarta il cervello, resta l'aspetto", () => {
  const good = buildPixyPresence(LOOK, brainWithExtras(), { share: true, shareBubbles: true, offsetMs: OFFSET });
  const bad = (patch: Record<string, unknown>) => parsePixyPresence({ ...good, brain: { ...good.brain, ...patch } }, SERVER);
  for (const patch of [
    { pose: "hack" },
    { mood: "<b>" },
    { costume: "crown" },
    { tempo: 99 },
    { costumeValue: 3 },
    { blink: 1 },
    { reaction: { ...good.brain!.reaction, until: SERVER + 3_600_000 } },
    { reaction: { ...good.brain!.reaction, emotion: "rage" } },
    { bubble: { ...good.brain!.bubble, text: "x".repeat(161) } },
    { bubble: { ...good.brain!.bubble, text: "   " } },
    { bubble: { ...good.brain!.bubble, id: 1.5 } },
  ]) {
    const p = bad(patch);
    assert.ok(p, `aspetto tenuto con ${JSON.stringify(patch).slice(0, 40)}`);
    assert.equal(p.brain, undefined, `cervello scartato con ${JSON.stringify(patch).slice(0, 40)}`);
  }
});

await test("campi in più tolti; il testo del fumetto resta testo", () => {
  const p = buildPixyPresence(LOOK, brainWithExtras(), { share: true, shareBubbles: true, offsetMs: OFFSET });
  const raw = JSON.parse(JSON.stringify(p));
  raw.extra = "x";
  raw.brain.extra = "y";
  raw.brain.bubble.text = "<img src=x onerror=alert(1)>";
  const back = parsePixyPresence(raw, SERVER)!;
  assert.equal("extra" in back, false);
  assert.equal("extra" in back.brain!, false);
  assert.equal(back.brain!.bubble!.text, "<img src=x onerror=alert(1)>", "nessuna trasformazione: React lo mostra come testo");
});

await test("più dispositivi: vince quello che condivide le espressioni", () => {
  const shared = buildPixyPresence(LOOK, brainWithExtras(), { share: true, shareBubbles: false, offsetMs: OFFSET });
  const plain = { v: 1, ...LOOK };
  const state = parsePixyChannelState({ anna: [plain, shared, { v: 9 }], bruno: [{ v: 9 }] }, SERVER);
  assert.ok(state.anna.brain);
  assert.equal(state.bruno, undefined, "nessun payload valido: non compare");
});

await test("per l'animatore: istanti di nuovo in ora locale, finiti tolti", () => {
  const p = buildPixyPresence(LOOK, brainWithExtras(), { share: true, shareBubbles: true, offsetMs: OFFSET }) as PixyPresence & {
    brain: NonNullable<PixyPresence["brain"]>;
  };
  const snap = sharedToSnapshot(p, OFFSET, LOCAL);
  assert.equal(snap.reaction?.until, LOCAL + 2500);
  assert.equal(snap.bubble?.until, LOCAL + 4000);
  assert.equal(snap.personality, "grumpy");
  assert.equal(snap.status, "Guarda YouTube");
  assert.equal(snap.canFollow, false);
  assert.equal(nextExpiry(snap), LOCAL + 2500);
  const later = sharedToSnapshot(p, OFFSET, LOCAL + 3000);
  assert.equal(later.reaction, null, "reazione finita");
  assert.ok(later.bubble, "il fumetto dura ancora");
  assert.equal(sharedToSnapshot(p, OFFSET, LOCAL + 5000).bubble, null);
});

await test("posa di ripiego: niente reazioni né fumetti, umore della posa", () => {
  const s = poseSnapshot("study", "calm");
  assert.equal(s.mood, "focused");
  assert.equal(s.costume, "book");
  assert.equal(s.reaction, null);
  assert.equal(s.bubble, null);
  assert.equal(poseSnapshot("idle", "calm").mood, "relaxed", "idle usa l'umore della personalità");
});

await test("hub: invii distanziati, parte sempre l'ultimo stato", async () => {
  let now = LOCAL;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const tracked: unknown[] = [];
  let listeners: PresenceListeners | null = null;
  const hub = new PresenceHub<number, { v: number }>(
    {
      now: () => now,
      join: (_g, l) => {
        listeners = l;
        return { track: async (p) => void tracked.push(p), leave: async () => {} };
      },
      setTimer: (fn, ms) => {
        const id = nextId++;
        timers.set(id, { at: now + ms, fn });
        return id;
      },
      clearTimer: (id) => void timers.delete(id as number),
      onChange: () => {},
    },
    { build: (local) => ({ v: local }), parse: () => ({}) },
    0,
    { minTrackIntervalMs: 2000 }
  );
  const run = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };
  hub.setGroups(["g"]);
  listeners!.status("joined");
  assert.deepEqual(tracked, [{ v: 0 }], "appena entrati si manda subito");
  hub.setLocal(1);
  hub.setLocal(2);
  hub.setLocal(3);
  assert.equal(tracked.length, 1, "entro 2 s non si rimanda");
  run(1999);
  assert.equal(tracked.length, 1);
  run(1);
  assert.deepEqual(tracked.at(-1), { v: 3 }, "dopo 2 s parte l'ultimo, non quelli di mezzo");
  assert.equal(tracked.length, 2);
  run(5000);
  hub.setLocal(3);
  assert.equal(tracked.length, 2, "uguale all'ultimo mandato: non si rimanda");
  hub.setLocal(4);
  assert.deepEqual(tracked.at(-1), { v: 4 }, "passati 2 s si manda subito");
  hub.setLocal(5);
  hub.stop();
  run(10_000);
  assert.equal(tracked.length, 3, "fermato: l'invio rimandato non parte");
});

console.log(`OK: ${passed} prove superate`);
