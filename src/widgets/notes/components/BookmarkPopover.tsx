import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { MdDeleteOutline, MdFormatColorReset } from "react-icons/md";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { BOOKMARK_COLORS, BOOKMARK_KINDS, NAME_MAX, asBookmarkName, type BookmarkData, type BookmarkPatch } from "../lib/bookmarks";
import { bookmarkIcon } from "./bookmarkIcons";
import "./BookmarkPopover.css";

interface BookmarkPopoverProps {
  data: BookmarkData;
  /** Rettangolo del segno sullo schermo: il popover si apre sotto (o sopra, se non c'è posto). */
  anchor: DOMRect;
  /** Segno appena inserito: il nome è già selezionato, da cambiare al volo. */
  fresh?: boolean;
  /** `live` = colore libero mentre si trascina nel selettore: le modifiche si uniscono in una voce sola. */
  onChange: (patch: BookmarkPatch, live?: boolean) => void;
  onDelete: () => void;
  /** `restoreFocus` = si torna al testo (Invio, Esc), non a dove si è cliccato. */
  onClose: (restoreFocus: boolean) => void;
}

const WIDTH = 286;

/** Nome, tipo e colore di un segno; ogni scelta è una modifica (e una voce di annulla). */
function BookmarkPopover({ data, anchor, fresh = false, onChange, onDelete, onClose }: BookmarkPopoverProps) {
  const [name, setName] = useState(data.name);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const custom = data.color && data.color.startsWith("#") ? data.color : null;

  // Sotto il segno; sopra se in basso non c'è posto. Sempre dentro la finestra.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const h = box.offsetHeight;
    const left = Math.max(8, Math.min(anchor.left - 12, window.innerWidth - WIDTH - 8));
    const below = anchor.bottom + 8;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 8) : below;
    setPos({ left, top });
  }, [anchor]);

  // Solo quando è visibile: un elemento con visibility: hidden non riceve il focus.
  const placed = pos !== null;
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !placed) return;
    input.focus({ preventScroll: true });
    if (fresh) input.select();
  }, [fresh, placed]);

  // Click fuori: si chiude (il nome scritto si salva).
  const commitRef = useLatestRef(() => {
    const next = asBookmarkName(name);
    if (next !== data.name) onChange({ name: next });
  });
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && e.target instanceof Node && boxRef.current.contains(e.target)) return;
      commitRef.current();
      onClose(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose, commitRef]);

  function close(restoreFocus: boolean) {
    commitRef.current();
    onClose(restoreFocus);
  }

  return (
    <div
      ref={boxRef}
      className="nq-menu nq-bm-pop"
      role="dialog"
      aria-label="Segno"
      style={{ left: pos?.left ?? anchor.left, top: pos?.top ?? anchor.bottom + 8, visibility: pos ? "visible" : "hidden", width: WIDTH } as CSSProperties}
      onKeyDown={(e) => {
        // I tasti del popover non arrivano alle scorciatoie della pagina.
        e.stopPropagation();
        // Esc, o Invio anche dopo aver scelto un tipo o un colore: si chiude e si torna al testo.
        if (e.key === "Escape" || (e.key === "Enter" && !(e.target instanceof HTMLInputElement && e.target.type === "color"))) {
          e.preventDefault();
          close(true);
        }
      }}
    >
      <label className="nq-bm-pop-name">
        <span>Nome</span>
        <input
          ref={inputRef}
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              close(true);
            }
          }}
          onBlur={() => commitRef.current()}
        />
      </label>

      <div className="nq-bm-pop-row" role="group" aria-label="Tipo">
        {BOOKMARK_KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            className="nq-bm-kind"
            aria-pressed={data.kind === k.key}
            aria-label={k.label}
            title={k.label}
            onClick={() => data.kind !== k.key && onChange({ kind: k.key })}
          >
            {bookmarkIcon(k.key)}
          </button>
        ))}
      </div>

      <div className="nq-bm-pop-row nq-bm-pop-colors" role="group" aria-label="Colore">
        <button
          type="button"
          className="nq-sw nq-sw--theme"
          aria-label="Colore del tema"
          title="Colore del tema"
          aria-pressed={data.color === null}
          onClick={() => data.color !== null && onChange({ color: null })}
        >
          <MdFormatColorReset />
        </button>
        {BOOKMARK_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            className="nq-sw nq-sw--ink"
            data-color={c.key}
            aria-label={c.label}
            title={c.label}
            aria-pressed={data.color === c.key}
            onClick={() => data.color !== c.key && onChange({ color: c.key })}
          />
        ))}
        <label
          className={`nq-ink-dot nq-ink-custom${custom ? " is-on" : ""}`}
          title="Altro colore"
          style={custom ? { background: custom } : undefined}
        >
          <input
            type="color"
            value={custom ?? "#1c7ed6"}
            onChange={(e) => onChange({ color: e.target.value.toLowerCase() }, true)}
            aria-label="Altro colore"
          />
        </label>
      </div>

      <button
        type="button"
        className="nq-bm-pop-delete"
        onClick={() => {
          onDelete();
          onClose(true);
        }}
      >
        <MdDeleteOutline aria-hidden="true" /> Elimina il segno
      </button>
    </div>
  );
}

export default BookmarkPopover;
