import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { kindLabel, type PagePin } from "../lib/bookmarks";
import { bookmarkColorVar, bookmarkIcon } from "./bookmarkIcons";
import "./InkPins.css";

interface InkPinsProps {
  pins: PagePin[];
  /** Strumento "segno" attivo: i segni si possono trascinare. */
  movable: boolean;
  onOpen: (pin: PagePin, anchor: DOMRect) => void;
  /** Rilasciato altrove: nuove coordinate (come l'inchiostro). */
  onMove: (id: string, x: number, y: number) => void;
}

/** Spostamento minimo (px) perché un trascinamento non valga come clic. */
const DRAG_PX = 4;

/**
 * I segni appoggiati sulla pagina: pulsanti sopra l'inchiostro, nelle sue coordinate (frazioni della
 * larghezza della pagina, dall'origine dell'inchiostro), così seguono zoom e titolo come i tratti.
 */
function InkPins({ pins, movable, onOpen, onMove }: InkPinsProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const start = useRef<{ id: string; cx: number; cy: number; moved: boolean } | null>(null);

  function pointAt(e: PointerEvent): { x: number; y: number } | null {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, (e.clientY - rect.top) / rect.width),
    };
  }

  function handleDown(e: PointerEvent<HTMLButtonElement>, pin: PagePin) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!movable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { id: pin.id, cx: e.clientX, cy: e.clientY, moved: false };
  }

  function handleMove(e: PointerEvent<HTMLButtonElement>) {
    const s = start.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.cx, e.clientY - s.cy) < DRAG_PX) return;
    s.moved = true;
    const p = pointAt(e);
    if (p) setDrag({ id: s.id, ...p });
  }

  function handleUp(e: PointerEvent<HTMLButtonElement>) {
    const s = start.current;
    start.current = null;
    if (!s?.moved) return;
    const p = pointAt(e);
    setDrag(null);
    if (p) onMove(s.id, p.x, p.y);
    // Il clic che segue il rilascio non deve aprire il popover.
    const swallow = (c: Event) => c.stopPropagation();
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 60);
  }

  return (
    <div ref={layerRef} className="nq-pins" aria-label="Segni sulla pagina">
      {pins.map((pin) => {
        const at = drag?.id === pin.id ? drag : pin;
        return (
          <button
            key={pin.id}
            type="button"
            className={`nq-pin${movable ? " is-movable" : ""}${drag?.id === pin.id ? " is-dragging" : ""}`}
            data-pin={pin.id}
            data-bm-kind={pin.kind}
            title={`${kindLabel(pin.kind)}: ${pin.name}`}
            aria-label={`Segno sulla pagina: ${pin.name}`}
            style={{ "--x": at.x, "--y": at.y, "--nq-bm": bookmarkColorVar(pin.color) } as CSSProperties}
            onPointerDown={(e) => handleDown(e, pin)}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={() => {
              start.current = null;
              setDrag(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(pin, e.currentTarget.getBoundingClientRect());
            }}
          >
            {bookmarkIcon(pin.kind)}
          </button>
        );
      })}
    </div>
  );
}

export default InkPins;
