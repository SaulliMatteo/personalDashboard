/*
 * Prove dei segni del Quaderno (src/widgets/notes/lib/bookmarks.ts): lettura dei segni dall'HTML salvato,
 * ordine con i segni sulla pagina, validazione (quello che tiene sanitizeHtml), nomi proposti, id, Markdown.
 * Funzioni pure, niente DOM. Lancio (da questa cartella del repo):
 *   npx rolldown scripts/notes/bookmarks.test.mts --file node_modules/.tmp/notes-bookmarks.test.mjs --platform node
 *   node node_modules/.tmp/notes-bookmarks.test.mjs
 */
import assert from "node:assert/strict";
import {
  MARKER_TEXT,
  asBookmarkColor,
  asBookmarkName,
  asPins,
  copiedHtmlFor,
  defaultBookmarkName,
  editPin,
  holdMarkerAnchors,
  isPinComment,
  markerAnchor,
  markerAttr,
  newBookmarkId,
  parsePins,
  pinsMarkdown,
  readBookmarks,
  readTextBookmarks,
  rememberCopy,
  type PagePin,
} from "../../src/widgets/notes/lib/bookmarks";

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

const marker = (id: string, attrs = "") => `<span data-bm="${id}"${attrs}></span>`;

test("legge i segni nel testo nell'ordine, con nome, tipo e colore", () => {
  const html =
    `<h1>Titolo ${marker("aaaaaaaa", ' data-bm-name="Primo &amp; &quot;vero&quot;" data-bm-kind="star" data-bm-color="rosso"')}</h1>` +
    `<p>testo ${marker("bbbbbbbb", ' data-bm-kind="important" data-bm-color="#AABBCC" title="x > y"')} altro</p>`;
  const list = readTextBookmarks(html);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { id: "aaaaaaaa", name: 'Primo & "vero"', kind: "star", color: "rosso" });
  assert.deepEqual(list[1], { id: "bbbbbbbb", name: "Segno", kind: "important", color: "#aabbcc" });
});

test("ignora id non validi, tipi sconosciuti e id ripetuti", () => {
  const html =
    marker("CORTO") +
    marker("cccccccc", ' data-bm-kind="boh" data-bm-color="url(x)"') +
    marker("cccccccc", ' data-bm-name="doppione"') +
    `<span data-ref-row="3">riga</span>`;
  const list = readTextBookmarks(html);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { id: "cccccccc", name: "Segno", kind: "bookmark", color: null });
});

test("un testo che parla di data-bm non è un segno", () => {
  assert.equal(readTextBookmarks("<p>scrivo &lt;span data-bm=&quot;aaaaaaaa&quot;&gt;</p>").length, 0);
});

test("ordine nella pagina: prima il testo, poi i segni sulla pagina dall'alto", () => {
  const pins: PagePin[] = [
    { id: "pppppppp", name: "In basso", kind: "bookmark", color: null, x: 0.2, y: 0.9 },
    { id: "qqqqqqqq", name: "In alto", kind: "todo", color: "verde", x: 0.5, y: 0.1 },
    // Lo stesso id di un segno nel testo: vince quello nel testo.
    { id: "aaaaaaaa", name: "Doppione", kind: "bookmark", color: null, x: 0, y: 0 },
  ];
  const list = readBookmarks(marker("aaaaaaaa", ' data-bm-name="Nel testo"'), pins);
  assert.deepEqual(
    list.map((b) => [b.id, b.place, b.position]),
    [
      ["aaaaaaaa", "testo", 0],
      ["qqqqqqqq", "pagina", 1],
      ["pppppppp", "pagina", 2],
    ]
  );
});

test("sanitize: tiene solo valori validi degli attributi data-bm*", () => {
  assert.equal(markerAttr("data-bm", "abcd1234"), "abcd1234");
  assert.equal(markerAttr("data-bm", "abc"), null);
  assert.equal(markerAttr("data-bm-kind", "question"), "question");
  assert.equal(markerAttr("data-bm-kind", "javascript"), null);
  assert.equal(markerAttr("data-bm-color", "blu"), "blu");
  assert.equal(markerAttr("data-bm-color", "#123ABC"), "#123abc");
  assert.equal(markerAttr("data-bm-color", "red; background:url(x)"), null);
  assert.equal(markerAttr("data-bm-name", "  due\n righe\t "), "due righe");
  assert.equal(markerAttr("data-bm-other", "x"), null);
  assert.equal(asBookmarkName("x".repeat(200)).length, 80);
  assert.equal(asBookmarkName(""), "Segno");
  assert.equal(asBookmarkColor("#fff"), null);
});

test("segni sulla pagina: solo quelli validi, coordinate dentro i limiti", () => {
  const pins = asPins([
    { id: "aaaaaaaa", name: "ok", kind: "star", color: "viola", x: 1.5, y: -2 },
    { id: "aaaaaaaa", name: "doppione", x: 0.1, y: 0.1 },
    { id: "bbbbbbbb", x: "0.1", y: 0.1 },
    { id: "zz", x: 0.1, y: 0.1 },
    null,
  ]);
  assert.deepEqual(pins, [{ id: "aaaaaaaa", name: "ok", kind: "star", color: "viola", x: 1, y: 0 }]);
  assert.deepEqual(parsePins("non json"), []);
  assert.deepEqual(parsePins(null), []);
});

test("rinomina ed elimina un segno sulla pagina", () => {
  const pins: PagePin[] = [{ id: "aaaaaaaa", name: "A", kind: "bookmark", color: null, x: 0.1, y: 0.2 }];
  assert.equal(editPin(pins, "bbbbbbbb", { name: "X" }), null);
  assert.deepEqual(editPin(pins, "aaaaaaaa", { name: "  Nuovo  ", color: "#00FF00" })?.[0], {
    id: "aaaaaaaa",
    name: "Nuovo",
    kind: "bookmark",
    color: "#00ff00",
    x: 0.1,
    y: 0.2,
  });
  assert.deepEqual(editPin(pins, "aaaaaaaa", "delete"), []);
});

test("nome proposto: le parole dopo il cursore, se no quelle prima", () => {
  assert.equal(defaultBookmarkName("  la formula del subnet mask /26 e altro", "prima"), "la formula del subnet mask");
  assert.equal(defaultBookmarkName(`${MARKER_TEXT}  `, "una due tre quattro cinque sei sette"), "tre quattro cinque sei sette");
  assert.equal(defaultBookmarkName("", ""), "Segno");
  assert.equal(defaultBookmarkName("empimento 2", "Riga di ri"), "riempimento 2");
});

test("id: 8 caratteri minuscoli o cifre, con il random iniettato", () => {
  let n = 0;
  const seq = [0, 0.5, 0.999, 0.1, 0.2, 0.3, 0.4, 0.6];
  const id = newBookmarkId(() => seq[n++ % seq.length]);
  assert.equal(id, "as9dhkov");
  for (let i = 0; i < 50; i++) assert.match(newBookmarkId(), /^[a-z0-9]{8}$/);
});

test("Markdown: ancora e ritorno al segno, commenti dei segni sulla pagina", () => {
  const anchor = markerAnchor({ id: "abcd1234", name: 'Nome "strano" & <b>', kind: "question" });
  assert.equal(anchor, '<a id="segno-abcd1234" title="? Nome &quot;strano&quot; &amp; &lt;b&gt;"></a>');
  const held: string[] = [];
  const line = holdMarkerAnchors(`prima ${anchor} dopo`, (html) => {
    held.push(html);
    return "@";
  });
  assert.equal(line, "prima @ dopo");
  assert.deepEqual(readTextBookmarks(held[0]), [{ id: "abcd1234", name: 'Nome "strano" & <b>', kind: "question", color: null }]);
  const comments = pinsMarkdown([{ id: "aaaaaaaa", name: "a -- b", kind: "star", color: null, x: 0, y: 0 }]);
  assert.equal(comments, "<!-- segno: ★ a – b -->");
  assert.ok(isPinComment(comments));
  assert.ok(!isPinComment("testo <!-- segno: x -->"));
});

test("copia dentro l'app: l'HTML si riconosce solo se il testo è lo stesso", () => {
  rememberCopy("ciao", "<p>ciao</p>");
  assert.equal(copiedHtmlFor("ciao"), "<p>ciao</p>");
  assert.equal(copiedHtmlFor("altro"), null);
});

console.log(`bookmarks: ${passed} prove superate`);
