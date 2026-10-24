import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  MdBrightness6,
  MdCheck,
  MdClose,
  MdCrop,
  MdDeleteOutline,
  MdFlip,
  MdFormatAlignCenter,
  MdFormatAlignLeft,
  MdFormatAlignRight,
  MdOutlineEdit,
  MdOutlineSubtitles,
  MdOutlineWrapText,
  MdRestartAlt,
  MdRotateRight,
  MdWidthFull,
} from "react-icons/md";
import type { InkStroke } from "../data/notesRepository";
import { attachmentUrl } from "../lib/attachmentUrls";
import { applyFreeStyle, freePosition, inkOriginPx } from "../lib/blocks";
import {
  FILTER_MAX,
  FILTER_MIN,
  WIDTH_MAX,
  WIDTH_MIN,
  imageLayout,
  initialWidth,
  isEdited,
  parseAlign,
  parseImageEdit,
  parseWidth,
  resetEdit,
  rotateRight,
  serializeImageEdit,
  type ImageAlign,
  type ImageCrop,
  type ImageEdit,
} from "../lib/imageEdit";
import { asStrokes } from "../lib/ink";
import InkLayer, { type InkTool } from "./InkLayer";
import "./ImageBlock.css";

interface ImageBlockProps {
  figure: HTMLElement;
  /** Cartella della nota su disco (null = copia su disco non ancora pronta). */
  noteDir: string | null;
  selected: boolean;
  onSelect: () => void;
  /** Gli attributi del blocco sono cambiati: si salva e va nella cronologia. */
  onCommit: () => void;
  onDelete: () => void;
  ink: { tool: InkTool; color: string; size: number };
}

function readStrokes(figure: HTMLElement): InkStroke[] {
  try {
    return asStrokes(JSON.parse(figure.dataset.ink ?? "[]"));
  } catch {
    return [];
  }
}

const FULL: ImageCrop = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Segue un trascinamento col puntatore "catturato" dall'elemento premuto: i movimenti arrivano
 * anche fuori dall'elemento e il gesto non viene interrotto da un trascinamento nativo.
 */
function track(e: ReactPointerEvent<HTMLElement>, onMove: (ev: PointerEvent) => void, onEnd: (ev: PointerEvent | null) => void) {
  e.preventDefault();
  e.stopPropagation();
  const el = e.currentTarget;
  const id = e.pointerId;
  try {
    el.setPointerCapture(id);
  } catch {
    /* puntatore già rilasciato */
  }
  const move = (ev: PointerEvent) => {
    if (ev.pointerId === id) onMove(ev);
  };
  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", finish);
    el.removeEventListener("pointercancel", finish);
    if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    onEnd(ev.type === "pointerup" ? ev : null);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);
}

/**
 * Il blocco è "non modificabile" dentro un testo modificabile: per Chromium è trascinabile.
 * Senza bloccare il mousedown partirebbe il trascinamento nativo, che interrompe maniglie e ritaglio.
 */
function stopNative(e: ReactMouseEvent) {
  e.preventDefault();
}

/**
 * Un'immagine nella pagina (<figure data-block="image">). Le modifiche (ritaglio, rotazione,
 * specchio, luminosità, contrasto, larghezza, allineamento, disegno) stanno negli attributi
 * del figure; il file su disco non cambia mai. Si disegna in un nodo di servizio del figure.
 */
function ImageBlock({ figure, noteDir, selected, onSelect, onCommit, onDelete, ink }: ImageBlockProps) {
  const name = figure.dataset.attachment ?? "";
  const [, setTick] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [panelState, setPanel] = useState<"light" | null>(null);
  const [drawingState, setDrawing] = useState(false);
  const [cropState, setCrop] = useState<ImageCrop | null>(null);
  // Ritaglio, disegno e pannello valgono solo finché l'immagine è selezionata.
  const panel = selected ? panelState : null;
  const drawing = selected && drawingState;
  const crop = selected ? cropState : null;
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  const boxRef = useRef<HTMLDivElement | null>(null);

  const edit = parseImageEdit(figure.dataset.edit);
  const align = parseAlign(figure.dataset.align);
  const width = parseWidth(figure.dataset.width) ?? initialWidth(edit.nw);
  const strokes = readStrokes(figure);
  const caption = figure.querySelector(":scope > figcaption");
  const free = freePosition(figure) !== null;

  // Immagine libera: posizione e larghezza in linea, ricalcolate dagli attributi a ogni disegno.
  useLayoutEffect(() => {
    applyFreeStyle(figure);
  });

  useEffect(() => {
    let cancelled = false;
    if (!noteDir || !name) return;
    attachmentUrl(noteDir, name)
      .then((u) => {
        if (!cancelled) {
          setUrl(u);
          setFailed(false);
        }
      })
      .catch((error) => {
        console.error("Immagine non leggibile:", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [noteDir, name]);

  // Misure in px (Fosforo le mostra accanto al mirino).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setBoxSize({ w: box.clientWidth, h: box.clientHeight }));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  /** Scrive gli attributi, ridisegna e salva. */
  function update(change: () => void, commit = true) {
    change();
    setTick((t) => t + 1);
    if (commit) onCommit();
  }

  function setEdit(next: ImageEdit, commit = true) {
    update(() => figure.setAttribute("data-edit", serializeImageEdit(next)), commit);
  }

  /** Allineare vuol dire stare nel testo: un'immagine libera ci torna. */
  function setAlign(next: ImageAlign) {
    update(() => {
      figure.removeAttribute("data-x");
      figure.removeAttribute("data-y");
      figure.setAttribute("data-align", next);
    });
  }

  function backToText() {
    update(() => {
      figure.removeAttribute("data-x");
      figure.removeAttribute("data-y");
    });
  }

  function toggleCaption() {
    update(() => {
      const existing = figure.querySelector(":scope > figcaption");
      if (existing) {
        existing.remove();
        return;
      }
      const cap = document.createElement("figcaption");
      cap.setAttribute("contenteditable", "true");
      cap.appendChild(document.createElement("br"));
      figure.appendChild(cap);
      window.requestAnimationFrame(() => {
        cap.focus();
        const sel = window.getSelection();
        sel?.selectAllChildren(cap);
        sel?.collapseToStart();
      });
    });
  }

  function reset() {
    update(() => {
      figure.setAttribute("data-edit", serializeImageEdit(resetEdit(edit)));
      figure.removeAttribute("data-ink");
      figure.removeAttribute("data-x");
      figure.removeAttribute("data-y");
      figure.setAttribute("data-align", "center");
      figure.setAttribute("data-width", String(initialWidth(edit.nw)));
    });
  }

  function onInk(next: InkStroke[]) {
    update(() => {
      if (next.length > 0) figure.setAttribute("data-ink", JSON.stringify(next));
      else figure.removeAttribute("data-ink");
    });
  }

  // ---------- Larghezza con le maniglie ----------
  /**
   * Ridimensionare da un angolo o da un lato (le proporzioni restano quelle dell'immagine).
   * dirX/dirY: verso in cui la maniglia allarga (+1 destra/giù, -1 sinistra/su, 0 = asse ignorato).
   * Nel testo al centro cresce da entrambi i lati; libera, resta fermo l'angolo opposto.
   */
  function startResize(e: ReactPointerEvent<HTMLElement>, dirX: -1 | 0 | 1, dirY: -1 | 0 | 1) {
    const page = figure.parentElement;
    const paper = figure.closest<HTMLElement>(".nq-paper");
    const box = boxRef.current;
    if (!page || !paper || !box) return;
    const textWidth = page.getBoundingClientRect().width;
    const startW = box.offsetWidth;
    const startH = box.offsetHeight || 1;
    const ratio = startW / startH;
    const sx = e.clientX;
    const sy = e.clientY;
    const startPos = freePosition(figure);
    // "Tutta la pagina" diventa una larghezza normale, centrata.
    const centered = !startPos && (align === "center" || align === "full");
    if (align === "full") figure.setAttribute("data-align", "center");
    const before = `${figure.dataset.width}|${figure.dataset.x}|${figure.dataset.y}`;
    track(
      e,
      (ev) => {
        // Di quanto allarga: il movimento più grande tra orizzontale e verticale (riportato in larghezza).
        const byX = dirX * (ev.clientX - sx);
        const byY = dirY * (ev.clientY - sy) * ratio;
        const grow = (Math.abs(byX) >= Math.abs(byY) ? byX : byY) * (centered ? 2 : 1);
        const pct = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(((startW + grow) / textWidth) * 100)));
        figure.setAttribute("data-width", String(pct));
        if (startPos) {
          // Libera: l'angolo opposto alla maniglia non si muove.
          const pw = paper.getBoundingClientRect().width || 1;
          const newW = (pct / 100) * textWidth;
          const newH = newW / ratio;
          const round = (v: number) => String(Math.round(v * 10000) / 10000);
          if (dirX < 0) figure.setAttribute("data-x", round(Math.max(0, startPos.x + (startW - newW) / pw)));
          if (dirY < 0) figure.setAttribute("data-y", round(startPos.y + (startH - newH) / pw));
          applyFreeStyle(figure);
        }
        setTick((t) => t + 1);
      },
      () => {
        const after = `${figure.dataset.width}|${figure.dataset.x}|${figure.dataset.y}`;
        if (after !== before || align === "full") onCommit();
      }
    );
  }

  // ---------- Spostare l'immagine trascinandola: libera sulla pagina ----------
  function startMove(e: ReactPointerEvent<HTMLElement>) {
    const paper = figure.closest<HTMLElement>(".nq-paper");
    if (!paper) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let moving = false;
    let startLeft = 0;
    let startTop = 0;
    track(
      e,
      (ev) => {
        if (!moving) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
          moving = true;
          // Da dove si trova adesso (nel testo o già libera) diventa libera in quel punto.
          const pr = paper.getBoundingClientRect();
          const fr = figure.getBoundingClientRect();
          startLeft = fr.left - pr.left;
          startTop = fr.top - pr.top;
          if (!free && !figure.dataset.width) figure.setAttribute("data-width", String(width));
          figure.setAttribute("data-moving", "");
        }
        const pr = paper.getBoundingClientRect();
        const fw = figure.offsetWidth;
        const fh = figure.offsetHeight;
        const left = Math.min(Math.max(0, startLeft + ev.clientX - sx), Math.max(0, pr.width - fw));
        const top = Math.min(Math.max(0, startTop + ev.clientY - sy), Math.max(0, pr.height - fh));
        const round = (v: number) => String(Math.round(v * 10000) / 10000);
        figure.setAttribute("data-x", round(left / pr.width));
        figure.setAttribute("data-y", round((top - inkOriginPx(paper)) / pr.width));
        applyFreeStyle(figure);
      },
      () => {
        figure.removeAttribute("data-moving");
        if (!moving) return;
        setTick((t) => t + 1);
        figure.focus({ preventScroll: true });
        onCommit();
      }
    );
  }

  // ---------- Ritaglio ----------
  function startCropDrag(e: ReactPointerEvent<HTMLElement>, corner: "tl" | "tr" | "bl" | "br" | "move") {
    const box = boxRef.current;
    if (!box || !crop) return;
    const rect = box.getBoundingClientRect();
    const from = { ...crop };
    const sx = e.clientX;
    const sy = e.clientY;
    const min = 0.05;
    track(e, (ev) => {
      const dx = (ev.clientX - sx) / rect.width;
      const dy = (ev.clientY - sy) / rect.height;
      let { x, y, w, h } = from;
      if (corner === "move") {
        x = Math.min(1 - w, Math.max(0, x + dx));
        y = Math.min(1 - h, Math.max(0, y + dy));
      } else {
        if (corner === "tl" || corner === "bl") {
          const nx = Math.min(x + w - min, Math.max(0, x + dx));
          w += x - nx;
          x = nx;
        } else {
          w = Math.min(1 - x, Math.max(min, w + dx));
        }
        if (corner === "tl" || corner === "tr") {
          const ny = Math.min(y + h - min, Math.max(0, y + dy));
          h += y - ny;
          y = ny;
        } else {
          h = Math.min(1 - y, Math.max(min, h + dy));
        }
      }
      setCrop({ x, y, w, h });
    }, () => undefined);
  }

  function applyCrop() {
    if (!crop) return;
    const full = crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999;
    setEdit({ ...edit, crop: full ? null : crop });
    setCrop(null);
  }

  // In ritaglio si vede l'immagine intera, senza rotazione: il riquadro è nelle sue coordinate.
  const shown: ImageEdit = crop ? { ...edit, crop: null, rotate: 0, flip: false } : edit;
  const layout = imageLayout(shown);
  const label = caption?.textContent?.trim() || name;

  return (
    <>
      <div
        ref={boxRef}
        className={`nq-imgbox${drawing ? " is-drawing" : ""}`}
        style={{ aspectRatio: String(layout.aspect) }}
        onMouseDown={stopNative}
        onDragStart={stopNative}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (!selected) {
            // Si riparte sempre dalla barra semplice.
            setPanel(null);
            setDrawing(false);
            setCrop(null);
            onSelect();
          }
          // Premuto e trascinato: si sposta l'immagine nel testo (non mentre si disegna o si ritaglia).
          if (!drawing && !crop) startMove(e);
        }}
      >
        {url && !failed ? (
          <div
            className="nq-img-inner"
            style={{ width: `${layout.inner.width}%`, height: `${layout.inner.height}%`, transform: layout.inner.transform }}
          >
            <img
              src={url}
              alt={label}
              draggable={false}
              onError={() => setFailed(true)}
              style={{
                width: `${layout.image.width}%`,
                height: `${layout.image.height}%`,
                left: `${layout.image.left}%`,
                top: `${layout.image.top}%`,
                filter: layout.image.filter,
              }}
            />
          </div>
        ) : (
          <div className="nq-img-missing" role="img" aria-label={label}>
            {failed ? `Immagine non trovata: ${name}` : noteDir ? "Caricamento…" : "La copia su disco non è ancora pronta"}
          </div>
        )}

        {!crop && (strokes.length > 0 || drawing) && (
          <InkLayer className="nq-img-ink" strokes={strokes} active={drawing} tool={ink.tool} color={ink.color} size={ink.size} onChange={onInk} />
        )}

        {crop && (
          <>
            {/* L'esterno del ritaglio scurito; il riquadro e gli angoli stanno sopra, senza essere tagliati. */}
            <div className="nq-crop-shade" aria-hidden="true">
              <div
                className="nq-crop-hole"
                style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
              />
            </div>
            <div
              className="nq-crop"
              style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
              onMouseDown={stopNative}
              onPointerDown={(e) => startCropDrag(e, "move")}
            >
              {(["tl", "tr", "bl", "br"] as const).map((c) => (
                <span key={c} className={`nq-crop-h nq-crop-h--${c}`} onMouseDown={stopNative} onPointerDown={(e) => startCropDrag(e, c)} />
              ))}
            </div>
          </>
        )}

        {selected && !crop && (
          <>
            <span className="nq-handle nq-h-tl" onMouseDown={stopNative} onPointerDown={(e) => startResize(e, -1, -1)} aria-hidden="true" />
            <span className="nq-handle nq-h-tr" onMouseDown={stopNative} onPointerDown={(e) => startResize(e, 1, -1)} aria-hidden="true" />
            <span className="nq-handle nq-h-bl" onMouseDown={stopNative} onPointerDown={(e) => startResize(e, -1, 1)} aria-hidden="true" />
            <span className="nq-handle nq-h-br" onMouseDown={stopNative} onPointerDown={(e) => startResize(e, 1, 1)} aria-hidden="true" />
            <span className="nq-handle nq-h-l" onMouseDown={stopNative} onPointerDown={(e) => startResize(e, -1, 0)} aria-hidden="true" />
            <span className="nq-handle nq-h-r" onMouseDown={stopNative} onPointerDown={(e) => startResize(e, 1, 0)} aria-hidden="true" />
            <span className="nq-measure" aria-hidden="true">
              {Math.round(boxSize.w)} × {Math.round(boxSize.h)} px, {align === "full" ? 100 : width}%
            </span>
          </>
        )}
      </div>

      {selected && (
        <div className="nq-imgbar" role="toolbar" aria-label="Modifica immagine" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => {
            // I pulsanti non rubano il focus al blocco; i cursori (luminosità, contrasto) sì, devono funzionare.
            if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
          }}>
          {crop ? (
            <>
              <span className="nq-imgbar-label">Trascina gli angoli per ritagliare</span>
              <button type="button" className="nq-tb" onClick={applyCrop} aria-label="Applica il ritaglio" title="Applica il ritaglio">
                <MdCheck />
              </button>
              <button type="button" className="nq-tb" onClick={() => setCrop(null)} aria-label="Annulla il ritaglio" title="Annulla il ritaglio">
                <MdClose />
              </button>
            </>
          ) : (
            <>
              <button type="button" className="nq-tb" onClick={() => setCrop(edit.crop ?? FULL)} aria-label="Ritaglia" title="Ritaglia">
                <MdCrop />
              </button>
              <button type="button" className="nq-tb" onClick={() => setEdit(rotateRight(edit))} aria-label="Ruota di 90°" title="Ruota di 90°">
                <MdRotateRight />
              </button>
              <button type="button" className="nq-tb" aria-pressed={edit.flip} onClick={() => setEdit({ ...edit, flip: !edit.flip })} aria-label="Specchia" title="Specchia">
                <MdFlip />
              </button>
              <button
                type="button"
                className="nq-tb"
                aria-pressed={panel === "light"}
                onClick={() => setPanel(panel === "light" ? null : "light")}
                aria-label="Luminosità e contrasto"
                title="Luminosità e contrasto"
              >
                <MdBrightness6 />
              </button>
              <button
                type="button"
                className="nq-tb"
                aria-pressed={drawing}
                onClick={() => setDrawing(!drawing)}
                aria-label={drawing ? "Smetti di disegnare" : "Disegna sopra"}
                title={drawing ? "Smetti di disegnare" : "Disegna sopra (penna, colore e spessore della scrittura a mano)"}
              >
                <MdOutlineEdit />
              </button>
              <span className="nq-tsep" />
              {free && (
                <button type="button" className="nq-tb" onClick={backToText} aria-label="Rimetti nel testo" title="Rimetti nel testo">
                  <MdOutlineWrapText />
                </button>
              )}
              <button type="button" className="nq-tb" aria-pressed={!free && align === "left"} onClick={() => setAlign("left")} aria-label="Allinea a sinistra" title="Allinea a sinistra">
                <MdFormatAlignLeft />
              </button>
              <button type="button" className="nq-tb" aria-pressed={!free && align === "center"} onClick={() => setAlign("center")} aria-label="Al centro" title="Al centro">
                <MdFormatAlignCenter />
              </button>
              <button type="button" className="nq-tb" aria-pressed={!free && align === "right"} onClick={() => setAlign("right")} aria-label="Allinea a destra" title="Allinea a destra">
                <MdFormatAlignRight />
              </button>
              <button type="button" className="nq-tb" aria-pressed={!free && align === "full"} onClick={() => setAlign("full")} aria-label="Tutta la pagina" title="Tutta la pagina">
                <MdWidthFull />
              </button>
              <span className="nq-tsep" />
              <button type="button" className="nq-tb" aria-pressed={!!caption} onClick={toggleCaption} aria-label={caption ? "Togli la didascalia" : "Didascalia"} title={caption ? "Togli la didascalia" : "Didascalia"}>
                <MdOutlineSubtitles />
              </button>
              <button
                type="button"
                className="nq-tb"
                disabled={!isEdited(edit) && strokes.length === 0 && !free && align === "center" && width === initialWidth(edit.nw)}
                onClick={reset}
                aria-label="Ripristina originale"
                title="Ripristina originale"
              >
                <MdRestartAlt />
              </button>
              <button type="button" className="nq-tb" onClick={onDelete} aria-label="Elimina l'immagine" title="Elimina l'immagine (Canc)">
                <MdDeleteOutline />
              </button>
            </>
          )}
          {panel === "light" && !crop && (
            <div className="nq-imgbar-pop">
              <label>
                <span>Luminosità {edit.brightness}%</span>
                <input
                  type="range"
                  min={FILTER_MIN}
                  max={FILTER_MAX}
                  value={edit.brightness}
                  onChange={(e) => setEdit({ ...edit, brightness: Number(e.target.value) }, false)}
                  onPointerUp={onCommit}
                  onKeyUp={onCommit}
                  aria-label="Luminosità"
                />
              </label>
              <label>
                <span>Contrasto {edit.contrast}%</span>
                <input
                  type="range"
                  min={FILTER_MIN}
                  max={FILTER_MAX}
                  value={edit.contrast}
                  onChange={(e) => setEdit({ ...edit, contrast: Number(e.target.value) }, false)}
                  onPointerUp={onCommit}
                  onKeyUp={onCommit}
                  aria-label="Contrasto"
                />
              </label>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default ImageBlock;
