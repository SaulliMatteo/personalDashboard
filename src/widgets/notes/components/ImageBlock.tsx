import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  MdRestartAlt,
  MdRotateRight,
  MdWidthFull,
} from "react-icons/md";
import type { InkStroke } from "../data/notesRepository";
import { attachmentUrl } from "../lib/attachmentUrls";
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

  function setAlign(next: ImageAlign) {
    update(() => figure.setAttribute("data-align", next));
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
  function startResize(e: ReactPointerEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    const page = figure.parentElement;
    if (!page) return;
    const pageRect = page.getBoundingClientRect();
    const start = figure.getBoundingClientRect();
    const centered = align === "center";
    const move = (ev: PointerEvent) => {
      // Al centro l'immagine cresce da entrambi i lati: la maniglia si sposta della metà.
      const grow = (ev.clientX - start.right) * (centered ? 2 : 1);
      const pct = Math.round(((start.width + grow) / pageRect.width) * 100);
      figure.setAttribute("data-width", String(Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, pct))));
      if (align === "full") figure.setAttribute("data-align", "center");
      setTick((t) => t + 1);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ---------- Ritaglio ----------
  function startCropDrag(e: ReactPointerEvent<HTMLElement>, corner: "tl" | "tr" | "bl" | "br" | "move") {
    e.preventDefault();
    e.stopPropagation();
    const box = boxRef.current;
    if (!box || !crop) return;
    const rect = box.getBoundingClientRect();
    const from = { ...crop };
    const sx = e.clientX;
    const sy = e.clientY;
    const min = 0.05;
    const move = (ev: PointerEvent) => {
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
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
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
        onPointerDown={(e) => {
          if (!drawing) e.preventDefault(); // niente selezione di testo trascinando sull'immagine
          if (!selected) {
            // Si riparte sempre dalla barra semplice.
            setPanel(null);
            setDrawing(false);
            setCrop(null);
            onSelect();
          }
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
          <div
            className="nq-crop"
            style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
            onPointerDown={(e) => startCropDrag(e, "move")}
          >
            {(["tl", "tr", "bl", "br"] as const).map((c) => (
              <span key={c} className={`nq-crop-h nq-crop-h--${c}`} onPointerDown={(e) => startCropDrag(e, c)} />
            ))}
          </div>
        )}

        {selected && !crop && (
          <>
            <span className="nq-handle nq-h-tl" aria-hidden="true" />
            <span className="nq-handle nq-h-tr" aria-hidden="true" />
            <span className="nq-handle nq-h-bl" aria-hidden="true" />
            <span className="nq-handle nq-h-br" onPointerDown={startResize} aria-hidden="true" />
            <span className="nq-handle nq-h-r" onPointerDown={startResize} aria-hidden="true" />
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
              <button type="button" className="nq-tb" aria-pressed={align === "left"} onClick={() => setAlign("left")} aria-label="Allinea a sinistra" title="Allinea a sinistra">
                <MdFormatAlignLeft />
              </button>
              <button type="button" className="nq-tb" aria-pressed={align === "center"} onClick={() => setAlign("center")} aria-label="Al centro" title="Al centro">
                <MdFormatAlignCenter />
              </button>
              <button type="button" className="nq-tb" aria-pressed={align === "right"} onClick={() => setAlign("right")} aria-label="Allinea a destra" title="Allinea a destra">
                <MdFormatAlignRight />
              </button>
              <button type="button" className="nq-tb" aria-pressed={align === "full"} onClick={() => setAlign("full")} aria-label="Tutta la pagina" title="Tutta la pagina">
                <MdWidthFull />
              </button>
              <span className="nq-tsep" />
              <button type="button" className="nq-tb" aria-pressed={!!caption} onClick={toggleCaption} aria-label={caption ? "Togli la didascalia" : "Didascalia"} title={caption ? "Togli la didascalia" : "Didascalia"}>
                <MdOutlineSubtitles />
              </button>
              <button
                type="button"
                className="nq-tb"
                disabled={!isEdited(edit) && strokes.length === 0 && align === "center" && width === initialWidth(edit.nw)}
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
