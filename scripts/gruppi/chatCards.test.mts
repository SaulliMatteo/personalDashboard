/*
 * Prove delle schede dei widget nella chat degli amici: cosa si accetta da un payload arrivato da un'altra persona
 * (video di YouTube, nota del Quaderno, invito a studiare), cosa si scarta e cosa si ripulisce. Funzioni pure.
 * Lancio (dalla cartella del repo; i file importano altri file senza estensione, quindi prima il bundle):
 *   npx rolldown scripts/gruppi/chatCards.test.mts --file node_modules/.tmp/gruppi-chatCards.test.mjs --platform node
 *   node node_modules/.tmp/gruppi-chatCards.test.mjs
 */
import assert from "node:assert/strict";
import { asCleanText } from "../../src/core/widgets/chatPayload";
import { parseVideoPayload, thumbnailOf, videoPayload } from "../../src/widgets/youtube/chat/videoPayload";
import { NOTE_PAGES_MAX, NoteTooBigError, buildNotePayload, parseNotePayload } from "../../src/widgets/notes/chat/notePayload";
import { describeInvite, invitePayload, parseInvitePayload } from "../../src/widgets/study/chat/invitePayload";
import type { NotePage } from "../../src/widgets/notes/data/notesRepository";

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

/* ---------- testo ---------- */

test("testo: caratteri di controllo e di direzione tolti, spazi ridotti, tagliato", () => {
  assert.equal(asCleanText("  Integrali‮ per\n\nparti\u0007 ", 100), "Integrali per parti");
  assert.equal(asCleanText("abcdef", 3), "abc");
  assert.equal(asCleanText("   ", 10), null);
  assert.equal(asCleanText(42, 10), null);
});

/* ---------- video ---------- */

test("video: andata e ritorno", () => {
  const p = videoPayload({ youtubeId: "dQw4w9WgXcQ", title: "Integrali per parti", channel: "Matematica Facile" });
  assert.deepEqual(parseVideoPayload(p), { youtubeId: "dQw4w9WgXcQ", title: "Integrali per parti", channel: "Matematica Facile" });
});

test("video: id non valido, un link al posto dell'id, versione diversa -> null", () => {
  assert.equal(parseVideoPayload({ v: 1, youtubeId: "corto", title: "x" }), null);
  assert.equal(parseVideoPayload({ v: 1, youtubeId: "https://youtu.be/dQw4w9WgXcQ", title: "x" }), null);
  assert.equal(parseVideoPayload({ v: 2, youtubeId: "dQw4w9WgXcQ" }), null);
  assert.equal(parseVideoPayload(null), null);
  assert.equal(parseVideoPayload("dQw4w9WgXcQ"), null);
});

test("video: titolo mancante, campi in più tolti, miniatura solo dall'id", () => {
  const p = parseVideoPayload({ v: 1, youtubeId: "dQw4w9WgXcQ", title: 5, thumbnailUrl: "https://evil.example/pixel.png" });
  assert.deepEqual(p, { youtubeId: "dQw4w9WgXcQ", title: "Video senza titolo", channel: "" });
  assert.equal(thumbnailOf("dQw4w9WgXcQ"), "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
});

/* ---------- nota ---------- */

// nell'app è sanitizeHtml (DOM); qui basta segnare che è passato di lì
const mark = (html: string) => `[pulito]${html}`;

function page(over: Partial<NotePage> = {}): NotePage {
  return { id: 1, noteId: 1, position: 0, content: "<p>ciao</p>", ink: [], background: "grid", color: null, pins: [], pdf: null, pdfInk: {}, ...over };
}

test("nota: l'HTML passa da cleanHtml sia all'invio sia all'arrivo", () => {
  const built = buildNotePayload("Integrali", "#aa3355", [page()], mark);
  const back = parseNotePayload(built.payload, mark);
  assert.ok(back);
  assert.equal(back.title, "Integrali");
  assert.equal(back.titleColor, "#aa3355");
  assert.equal(back.pages[0].content, "[pulito][pulito]<p>ciao</p>");
  assert.equal(back.pages[0].background, "grid");
});

test("nota: le pagine con un PDF restano fuori (e si contano)", () => {
  const pdf = { name: "a.pdf" } as unknown as NotePage["pdf"];
  const built = buildNotePayload("N", null, [page(), page({ id: 2, pdf })], mark);
  assert.equal((built.payload.pages as unknown[]).length, 1);
  assert.equal(built.skippedPdf, 1);
});

test("nota: troppo grande -> NoteTooBigError", () => {
  const big = page({ content: `<p>${"x".repeat(600_000)}</p>` });
  assert.throws(() => buildNotePayload("N", null, [big], (h) => h), NoteTooBigError);
});

test("nota: inchiostro, sfondo, colori e pagine non validi vengono ripuliti", () => {
  const back = parseNotePayload(
    {
      v: 1,
      title: "‮titolo",
      titleColor: "javascript:alert(1)",
      pages: [
        {
          content: 7,
          ink: [
            { tool: "pen", color: "#112233", size: 3, points: [[0.1, 0.2]] },
            { tool: "laser", color: "#112233", size: 3, points: [[0, 0]] },
            { tool: "pen", color: "red", size: 3, points: [[0, 0]] },
          ],
          background: "<script>",
          color: "url(x)",
        },
        "non una pagina",
      ],
    },
    (h) => h
  );
  assert.ok(back);
  assert.equal(back.title, "titolo");
  assert.equal(back.titleColor, null);
  assert.equal(back.pages.length, 1);
  assert.equal(back.pages[0].content, "<p><br></p>");
  assert.equal(back.pages[0].ink.length, 1);
  assert.equal(back.pages[0].background, "none");
  assert.equal(back.pages[0].color, null);
});

test("nota: senza pagine o versione diversa -> null; al massimo 50 pagine", () => {
  assert.equal(parseNotePayload({ v: 1, title: "x", pages: [] }, (h) => h), null);
  assert.equal(parseNotePayload({ v: 2, title: "x", pages: [{ content: "a" }] }, (h) => h), null);
  const many = parseNotePayload({ v: 1, title: "x", pages: Array.from({ length: 80 }, () => ({ content: "a" })) }, (h) => h);
  assert.equal(many?.pages.length, NOTE_PAGES_MAX);
});

/* ---------- invito ---------- */

test("invito: andata e ritorno, con e senza materia e ora", () => {
  const full = invitePayload({ subject: { name: "Analisi 2", color: "#E89A5B" }, at: "18:00" });
  assert.deepEqual(parseInvitePayload(full), { subject: { name: "Analisi 2", color: "#e89a5b" }, at: "18:00" });
  assert.deepEqual(parseInvitePayload(invitePayload({ subject: null, at: null })), { subject: null, at: null });
  assert.equal(describeInvite({ subject: { name: "Analisi 2", color: "#e89a5b" }, at: "18:00" }), "📚 Invito a studiare: Analisi 2 alle 18:00");
  assert.equal(describeInvite({ subject: null, at: null }), "📚 Invito a studiare");
});

test("invito: ora e colore non validi tolti, materia senza colore tolta", () => {
  assert.deepEqual(parseInvitePayload({ v: 1, subject: { name: "Fisica", color: "red; background:url(x)" }, at: "25:00" }), {
    subject: null,
    at: null,
  });
  assert.deepEqual(parseInvitePayload({ v: 1, subject: { name: "", color: "#112233" }, at: "7:30" }), { subject: null, at: null });
  assert.equal(parseInvitePayload({ v: 3 }), null);
});

console.log(`schede della chat: ${passed} prove passate`);
