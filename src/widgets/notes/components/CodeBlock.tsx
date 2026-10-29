import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MdCheck, MdContentCopy, MdDeleteOutline, MdFormatListNumbered } from "react-icons/md";
import { codeTextOf, setCodeText } from "../lib/blocks";
import { indentEdit, newlineEdit, type TextEdit } from "../lib/codeEdit";
import { highlightCode, type CodeToken } from "../lib/codeHighlight";
import { CODE_LANGUAGES, asCodeLang, asLangName, isKnownLang, langFromInput, langLabel } from "../lib/codeLanguages";
import "./CodeBlock.css";

/**
 * Blocco di codice nella pagina (dentro il nodo di React del blocco, lib/blocks.ts).
 * Si scrive in un <textarea> trasparente sopra un <pre> con l'evidenziazione: il textarea ha il
 * suo cursore e il suo annulla, isolati dal contentEditable della pagina.
 *
 * Il codice è SOLO testo: il textarea lo tratta come testo, l'evidenziazione lo disegna con React
 * (testo escapato in automatico, solo <span> con classi), nel salvataggio va come textContent.
 * Niente link cliccabili, niente anteprime, niente "esegui".
 */

interface CodeBlockProps {
  block: HTMLElement;
  /** Salva la pagina (una voce nella cronologia della nota). */
  onCommit: () => void;
  onRemove: () => void;
  /** Esce dal blocco: cursore nel testo sotto. */
  onExit: () => void;
}

/** Pausa dopo cui il testo scritto nel blocco entra nella cronologia della nota. */
const COMMIT_MS = 700;

function renderTokens(tokens: readonly CodeToken[]): ReactNode[] {
  return tokens.map((t, i) =>
    typeof t === "string" ? (
      t
    ) : (
      <span key={i} className={t.cls}>
        {renderTokens(t.children)}
      </span>
    )
  );
}

function CodeBlock({ block, onCommit, onRemove, onExit }: CodeBlockProps) {
  const [text, setText] = useState(() => codeTextOf(block));
  /** Nome del linguaggio: uno supportato (con i colori) o uno scritto a mano (senza colori). */
  const [lang, setLang] = useState(() => asLangName(block.dataset.lang));
  /** Testo nel campo del linguaggio mentre lo si scrive. */
  const [langDraft, setLangDraft] = useState<string | null>(null);
  const listId = useId();
  const [lines, setLines] = useState(() => block.dataset.lines === "1");
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const timer = useRef<number | null>(null);

  const tokens = useMemo(() => highlightCode(text, asCodeLang(lang)), [text, lang]);
  const lineCount = text.split("\n").length;

  // Blocco appena creato (```py + Invio, barra strumenti, incolla): il cursore ci entra.
  useEffect(() => {
    if (block.hasAttribute("data-focus")) {
      block.removeAttribute("data-focus");
      area.current?.focus();
    }
  }, [block]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  function commitNow() {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    onCommit();
  }

  function write(value: string) {
    setText(value);
    setCodeText(block, value);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onCommit();
    }, COMMIT_MS);
  }

  /** Applica una modifica come se fosse scritta: l'annulla del textarea la conosce. */
  function apply(edit: TextEdit) {
    const el = area.current;
    if (!el) return;
    el.setSelectionRange(edit.from, edit.to);
    const ok = edit.text === "" ? document.execCommand("delete") : document.execCommand("insertText", false, edit.text);
    if (!ok) {
      // Senza execCommand: si scrive il valore (si perde solo l'annulla di questo passo).
      const value = el.value.slice(0, edit.from) + edit.text + el.value.slice(edit.to);
      el.value = value;
      write(value);
    }
    el.setSelectionRange(edit.selStart, edit.selEnd);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const mods = e.ctrlKey || e.metaKey || e.altKey;
    if (e.key === "Tab" && !mods) {
      e.preventDefault();
      const edit = indentEdit(el.value, el.selectionStart, el.selectionEnd, e.shiftKey ? -1 : 1);
      if (edit) apply(edit);
    } else if (e.key === "Enter" && !mods && !e.shiftKey) {
      e.preventDefault();
      apply(newlineEdit(el.value, el.selectionStart, el.selectionEnd));
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitNow();
      onExit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      commitNow();
      onExit();
    } else if (e.key === "ArrowDown" && !mods && !e.shiftKey && el.selectionStart === el.value.length) {
      e.preventDefault();
      commitNow();
      onExit();
    } else if (e.key === "Backspace" && el.value === "") {
      e.preventDefault();
      onRemove();
    }
  }

  /** Conferma quello scritto nel campo: un linguaggio supportato, o il nome così com'è. */
  function commitLang() {
    if (langDraft === null) return;
    setLangDraft(null);
    if (langDraft.trim() === "") return; // aperto e lasciato vuoto: resta quello di prima
    const next = langFromInput(langDraft);
    if (next === lang) return;
    setLang(next);
    block.setAttribute("data-lang", next);
    onCommit();
  }

  function handleLangKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitLang();
      area.current?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setLangDraft(null);
      area.current?.focus();
    }
  }

  function toggleLines() {
    const next = !lines;
    setLines(next);
    if (next) block.setAttribute("data-lines", "1");
    else block.removeAttribute("data-lines");
    onCommit();
  }

  function copy() {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch((error) => console.error("Copia del codice non riuscita:", error));
  }

  const label = langLabel(lang);

  return (
    <div className="nq-code" data-lang={lang}>
      <div className="nq-code-bar">
        {/* Si sceglie dall'elenco o si scrive: un linguaggio che non abbiamo resta col suo nome, senza colori. */}
        <input
          className={`nq-code-lang${isKnownLang(lang) ? "" : " is-custom"}`}
          list={listId}
          value={langDraft ?? label}
          onChange={(e) => setLangDraft(e.target.value)}
          // Campo vuoto all'apertura: l'elenco mostra tutti i linguaggi (quello attuale nel segnaposto).
          onFocus={() => setLangDraft("")}
          placeholder={label}
          onBlur={commitLang}
          onKeyDown={handleLangKey}
          spellCheck={false}
          autoComplete="off"
          maxLength={24}
          size={Math.max(6, (langDraft ?? label).length + 1)}
          aria-label="Linguaggio del codice (scegli o scrivi)"
          title={isKnownLang(lang) ? "Linguaggio: scegli dall'elenco o scrivine uno" : "Linguaggio scritto a mano: il codice resta senza colori"}
        />
        <datalist id={listId}>
          {CODE_LANGUAGES.map((l) => (
            <option key={l.id} value={l.label} />
          ))}
        </datalist>
        <span className="nq-code-gap" />
        <button
          type="button"
          className="nq-code-btn"
          aria-pressed={lines}
          onClick={toggleLines}
          title={lines ? "Nascondi i numeri di riga" : "Mostra i numeri di riga"}
          aria-label="Numeri di riga"
        >
          <MdFormatListNumbered />
        </button>
        <button type="button" className="nq-code-btn" onClick={copy} title="Copia il codice" aria-label="Copia il codice">
          {copied ? <MdCheck /> : <MdContentCopy />}
          <span className="nq-code-btn-text">{copied ? "Copiato" : "Copia"}</span>
        </button>
        <button type="button" className="nq-code-btn" onClick={onRemove} title="Elimina il blocco" aria-label="Elimina il blocco di codice">
          <MdDeleteOutline />
        </button>
      </div>
      <div className="nq-code-body">
        {lines && (
          <div className="nq-code-gutter" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        )}
        <div className="nq-code-scroll">
          <div className="nq-code-stack">
            {/* Solo testo e <span> con classi: React escapa tutto, niente HTML grezzo. */}
            <pre className="nq-code-hl nq-hl" aria-hidden="true">
              {renderTokens(tokens)}
              {"\n"}
            </pre>
            <textarea
              ref={area}
              className="nq-code-input"
              value={text}
              onChange={(e) => write(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={commitNow}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              wrap="off"
              rows={1}
              placeholder="Scrivi il codice…"
              aria-label={`Codice ${label}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default CodeBlock;
