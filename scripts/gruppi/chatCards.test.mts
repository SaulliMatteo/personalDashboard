/*
 * Prove delle schede dei widget nella chat degli amici: cosa si accetta da un payload arrivato da un'altra persona
 * (video di YouTube, nota del Quaderno con i suoi file, invito a studiare), cosa si scarta e cosa si ripulisce. Funzioni pure.
 * Lancio (dalla cartella del repo; i file importano altri file senza estensione, quindi prima il bundle):
 *   npx rolldown scripts/gruppi/chatCards.test.mts --file node_modules/.tmp/gruppi-chatCards.test.mjs --platform node
 *   node node_modules/.tmp/gruppi-chatCards.test.mjs
 */
import assert from "node:assert/strict";
import { CHAT_FILES_MAX_BYTES, asBatchId, asCleanText, batchOfPayload } from "../../src/core/widgets/chatPayload";
import { parseVideoPayload, thumbnailOf, videoPayload } from "../../src/widgets/youtube/chat/videoPayload";
import {
  NOTE_PAGES_MAX,
  NoteFilesTooBigError,
  NoteTooBigError,
  buildNotePayload,
  noteFileNames,
  parseNotePayload,
} from "../../src/widgets/notes/chat/notePayload";
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

// nell'app è sanitizeHtml (DOM): qui basta segnare che è passato di lì e con quali file ammessi
const mark = (html: string, files: ReadonlySet<string>) => `[pulito${files.size > 0 ? `:${[...files].sort().join(",")}` : ""}]${html}`;
const same = (h: string) => h;
const BATCH = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

function page(over: Partial<NotePage> = {}): NotePage {
  return { id: 1, noteId: 1, position: 0, content: "<p>ciao</p>", ink: [], background: "grid", color: null, pins: [], pdf: null, pdfInk: {}, ...over };
}

const PDF = { id: "b0000001", file: "dispensa.pdf", name: "Dispensa.pdf", from: 1, to: 2, sizes: [[595, 842], [595, 842]] as [number, number][] };

test("nota: l'HTML passa da cleanHtml sia all'invio sia all'arrivo", () => {
  const built = buildNotePayload("Integrali", "#aa3355", [page()], mark);
  assert.equal(built.v, 1);
  assert.equal(built.files, undefined);
  const back = parseNotePayload(built, mark);
  assert.ok(back);
  assert.equal(back.title, "Integrali");
  assert.equal(back.titleColor, "#aa3355");
  assert.equal(back.pages[0].content, "[pulito][pulito]<p>ciao</p>");
  assert.equal(back.pages[0].background, "grid");
  assert.equal(back.files, null);
});

test("nota senza file: le pagine con un PDF restano fuori", () => {
  const built = buildNotePayload("N", null, [page(), page({ id: 2, pdf: PDF })], mark);
  assert.equal((built.pages as unknown[]).length, 1);
});

test("nota con file: v 2, pagine PDF dentro, cleanHtml riceve i nomi dei file", () => {
  const files = { batch: BATCH, list: [{ name: "dispensa.pdf", size: 1000 }, { name: "foto.png", size: 200 }] };
  const built = buildNotePayload("N", null, [page(), page({ id: 2, pdf: PDF, pdfInk: { "1": [] } })], mark, files);
  assert.equal(built.v, 2);
  assert.deepEqual(built.files, files);
  const back = parseNotePayload(built, mark);
  assert.ok(back);
  assert.equal(back.pages.length, 2);
  assert.equal(back.pages[1].pdf?.file, "dispensa.pdf");
  assert.equal(back.pages[0].content, "[pulito:dispensa.pdf,foto.png][pulito:dispensa.pdf,foto.png]<p>ciao</p>");
  assert.deepEqual(back.files, files);
  assert.equal(batchOfPayload(built), BATCH);
});

test("nota con file: oltre 10 MB in tutto -> NoteFilesTooBigError", () => {
  const files = { batch: BATCH, list: [{ name: "a.pdf", size: CHAT_FILES_MAX_BYTES }, { name: "b.png", size: 1 }] };
  assert.throws(() => buildNotePayload("N", null, [page()], same, files), NoteFilesTooBigError);
});

test("nota ricevuta: lotto, nomi e dimensioni non validi tolti; PDF senza il suo file fuori", () => {
  const back = parseNotePayload(
    {
      v: 2,
      title: "N",
      pages: [{ content: "a" }, { content: "", pdf: PDF }, { content: "", pdf: { ...PDF, file: "altro.pdf" } }, { content: "", pdf: { ...PDF, file: "../x.pdf" } }],
      files: {
        batch: BATCH,
        list: [
          { name: "dispensa.pdf", size: 10 },
          { name: "../../evil.png", size: 1 },
          { name: "a/b.png", size: 1 },
          { name: "dispensa.pdf", size: 3 },
          { name: "neg.png", size: -1 },
          { name: "grosso.png", size: CHAT_FILES_MAX_BYTES },
          { name: "ok.png", size: 5 },
        ],
      },
    },
    same
  );
  assert.ok(back);
  assert.deepEqual(back.files?.list, [{ name: "dispensa.pdf", size: 10 }, { name: "ok.png", size: 5 }]);
  assert.equal(back.pages.length, 2);
  assert.equal(back.pages[1].pdf?.file, "dispensa.pdf");
});

test("nota ricevuta: lotto non valido -> niente file (e niente pagine PDF)", () => {
  const back = parseNotePayload({ v: 2, title: "N", pages: [{ content: "a" }, { content: "", pdf: PDF }], files: { batch: "../x", list: [{ name: "dispensa.pdf", size: 1 }] } }, same);
  assert.ok(back);
  assert.equal(back.files, null);
  assert.equal(back.pages.length, 1);
  assert.equal(asBatchId(BATCH.toUpperCase()), null);
  assert.equal(batchOfPayload({ files: { batch: "x" } }), null);
});

test("nota: v 1 con un campo files lo ignora", () => {
  const back = parseNotePayload({ v: 1, title: "N", pages: [{ content: "a" }], files: { batch: BATCH, list: [{ name: "a.png", size: 1 }] } }, same);
  assert.equal(back?.files, null);
});

test("nota: i file da mandare sono allegati e PDF delle pagine, senza doppioni né nomi strani", () => {
  assert.deepEqual(noteFileNames([page(), page({ pdf: PDF }), page({ pdf: PDF })], ["foto.png", "../x", "dispensa.pdf"]), ["foto.png", "dispensa.pdf"]);
});

test("nota: troppo grande -> NoteTooBigError", () => {
  const big = page({ content: `<p>${"x".repeat(600_000)}</p>` });
  assert.throws(() => buildNotePayload("N", null, [big], same), NoteTooBigError);
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
    same
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

test("nota: senza pagine o versione sconosciuta -> null; al massimo 50 pagine", () => {
  assert.equal(parseNotePayload({ v: 1, title: "x", pages: [] }, same), null);
  assert.equal(parseNotePayload({ v: 3, title: "x", pages: [{ content: "a" }] }, same), null);
  const many = parseNotePayload({ v: 1, title: "x", pages: Array.from({ length: 80 }, () => ({ content: "a" })) }, same);
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
