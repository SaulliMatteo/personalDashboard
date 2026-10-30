import { useEffect, useRef, type PointerEvent } from "react";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { useTheme } from "../../../core/theme/useTheme";
import type { InkStroke } from "../data/notesRepository";
import { REF_WIDTH, THEME_INK, drawStrokes } from "../lib/ink";
import { adjustShape, createHoldDetector, recognizeShape, shapeToPoints, type HoldDetector, type Pt, type Shape } from "../lib/shapes";

export type InkTool = "pen" | "highlighter" | "eraser";

/** Tempo fermo (ms) e movimento ammesso (px sullo schermo) che fanno scattare la forma. */
const HOLD_MS = 500;
const HOLD_PX = 4;
/** Sotto questa grandezza (px) un tratto è un puntino: resta a mano. */
const MIN_SHAPE_PX = 12;
/** Distanza tra i punti salvati di una forma, in px di riferimento (la gomma tocca i punti). */
const SHAPE_STEP = 3 / REF_WIDTH;
/** Durata dell'alone quando la forma scatta. */
const FLASH_MS = 280;

/** Alone attorno alla forma appena scattata: 0 = inizio, 1 = finito. */
interface Halo {
  stroke: InkStroke;
  progress: number;
}

function paint(canvas: HTMLCanvasElement, strokes: readonly InkStroke[], halo?: Halo) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pxW = Math.round(w * dpr);
  const pxH = Math.round(h * dpr);
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // Letto dal canvas stesso: vale il token del tema e della variante (e del pigmento in Opaco).
  const style = getComputedStyle(canvas);
  const ink = style.getPropertyValue("--text-primary").trim() || THEME_INK;
  if (halo && halo.progress < 1) {
    // Un'onda che si allarga e sparisce, nel colore d'accento del tema.
    const t = halo.progress;
    const { stroke } = halo;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.45 * (1 - t);
    ctx.strokeStyle = style.getPropertyValue("--accent").trim() || ink;
    const base = stroke.size * (stroke.tool === "highlighter" ? 5 : 1) * (w / REF_WIDTH);
    ctx.lineWidth = base + 4 + 10 * t;
    ctx.beginPath();
    stroke.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * w) : ctx.lineTo(x * w, y * w)));
    ctx.stroke();
    ctx.restore();
  }
  drawStrokes(ctx, w, strokes, (c) => (c.toLowerCase() === THEME_INK ? ink : c));
}

/** Forma scattata mentre si tiene premuto: si regola finché non si solleva. */
interface Snap {
  /** La forma riconosciuta (punto di partenza di ogni regolazione). */
  base: Shape;
  shape: Shape;
  /** Dov'era il puntatore allo scatto. */
  grab: Pt;
  /** Il tratto a mano libera: torna con il primo Ctrl+Z. */
  free: InkStroke;
  flashAt: number;
}

interface InkLayerProps {
  strokes: InkStroke[];
  /** True = intercetta penna/dito/mouse; false = lascia passare i click al testo. */
  active: boolean;
  tool: InkTool;
  color: string;
  size: number;
  /** Forme automatiche: tenendo fermo il puntatore a fine tratto, il tratto diventa una forma. */
  shapes?: boolean;
  onChange: (strokes: InkStroke[]) => void;
  /** Classe del canvas: "nq-ink" sulla pagina, un'altra dentro un'immagine. */
  className?: string;
}

function InkLayer({ strokes, active, tool, color, size, shapes = false, onChange, className = "nq-ink" }: InkLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useLatestRef(strokes);
  const live = useRef<InkStroke | null>(null);
  const erasing = useRef(false);
  const hold = useRef<HoldDetector | null>(null);
  const holdTimer = useRef<number | null>(null);
  /** Un px dello schermo nelle coordinate dei tratti (la pagina può essere ingrandita). */
  const pxUnit = useRef(1 / REF_WIDTH);
  const snap = useRef<Snap | null>(null);
  const pointer = useRef<Pt>([0, 0]);
  const shift = useRef(false);
  const flashFrame = useRef<number | null>(null);
  const theme = useTheme();

  /** Il tratto in corso: la forma, se è scattata, altrimenti quello a mano. */
  function liveStroke(): InkStroke | null {
    const s = snap.current;
    if (s) return { ...s.free, points: shapeToPoints(s.shape, SHAPE_STEP) };
    return live.current;
  }

  function repaint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stroke = liveStroke();
    const s = snap.current;
    const halo = s && stroke ? { stroke, progress: (performance.now() - s.flashAt) / FLASH_MS } : undefined;
    paint(canvas, stroke ? [...strokesRef.current, stroke] : strokesRef.current, halo);
  }

  function stopHold() {
    if (holdTimer.current !== null) window.clearInterval(holdTimer.current);
    holdTimer.current = null;
    hold.current = null;
  }

  function stopFlash() {
    if (flashFrame.current !== null) cancelAnimationFrame(flashFrame.current);
    flashFrame.current = null;
  }

  // Timer e animazione non sopravvivono al componente.
  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearInterval(holdTimer.current);
      if (flashFrame.current !== null) cancelAnimationFrame(flashFrame.current);
    },
    []
  );

  // Si ridisegna anche quando cambiano tema o variante (compreso "auto" che segue il sistema).
  useEffect(() => {
    if (canvasRef.current) paint(canvasRef.current, strokes);
  }, [strokes, theme.id, theme.mode]);

  // La pagina cambia altezza mentre si scrive: il canvas va ridisegnato.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const stroke = snap.current ? { ...snap.current.free, points: shapeToPoints(snap.current.shape, SHAPE_STEP) } : live.current;
      paint(canvas, stroke ? [...strokesRef.current, stroke] : strokesRef.current);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [strokesRef]);

  /** Forma regolata secondo dov'è il puntatore (e Shift). */
  function adjust() {
    const s = snap.current;
    if (!s) return;
    s.shape = adjustShape(s.base, s.grab, pointer.current, { constrain: shift.current });
    repaint();
  }

  // Shift premuto o lasciato mentre si tiene fermo: la forma si aggiorna subito.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Shift" || shift.current === e.shiftKey) return;
      shift.current = e.shiftKey;
      adjust();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
    // adjust legge solo ref: non serve rilegare gli ascoltatori.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /** Il puntatore è fermo da abbastanza: si prova a riconoscere la forma. */
  function checkHold() {
    const stroke = live.current;
    if (!stroke || !hold.current?.check()) return;
    const found = recognizeShape(stroke.points, { minSize: MIN_SHAPE_PX * pxUnit.current, tailTolerance: HOLD_PX * pxUnit.current });
    if (!found) {
      // Niente forma: resta a mano, e si può continuare il tratto e riprovare.
      hold.current.reset();
      return;
    }
    stopHold();
    snap.current = { base: found.shape, shape: found.shape, grab: pointer.current, free: stroke, flashAt: performance.now() };
    const tick = () => {
      repaint();
      const s = snap.current;
      flashFrame.current = s && performance.now() - s.flashAt < FLASH_MS ? requestAnimationFrame(tick) : null;
    };
    stopFlash();
    tick();
  }

  function pointOf(e: PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.width];
  }

  function eraseAt(p: [number, number]) {
    const radius = 14 / REF_WIDTH;
    const current = strokesRef.current;
    const next = current.filter((s) => !s.points.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < radius));
    if (next.length !== current.length) onChange(next);
  }

  function handleDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!active) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointOf(e);
    if (tool === "eraser") {
      erasing.current = true;
      eraseAt(p);
      return;
    }
    live.current = { tool, color, size, points: [p] };
    snap.current = null;
    pointer.current = p;
    shift.current = e.shiftKey;
    stopHold();
    if (shapes) {
      pxUnit.current = 1 / (e.currentTarget.getBoundingClientRect().width || REF_WIDTH);
      hold.current = createHoldDetector({ now: () => performance.now(), holdMs: HOLD_MS, tolerance: HOLD_PX * pxUnit.current });
      hold.current.feed(p);
      // Da fermi non arrivano eventi: il controllo va fatto anche col timer.
      holdTimer.current = window.setInterval(checkHold, 50);
    }
    repaint();
  }

  function handleMove(e: PointerEvent<HTMLCanvasElement>) {
    const p = pointOf(e);
    if (erasing.current) {
      eraseAt(p);
      return;
    }
    pointer.current = p;
    if (snap.current) {
      shift.current = e.shiftKey;
      adjust();
      return;
    }
    const stroke = live.current;
    if (!stroke) return;
    hold.current?.feed(p);
    const last = stroke.points[stroke.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.0008) return;
    stroke.points.push(p);
    repaint();
  }

  function handleUp() {
    erasing.current = false;
    stopHold();
    stopFlash();
    const s = snap.current;
    const stroke = liveStroke();
    live.current = null;
    snap.current = null;
    if (!stroke) return;
    const base = strokesRef.current;
    if (s) {
      // Due modifiche, due voci in cronologia: il primo Ctrl+Z torna al tratto a mano, il secondo lo toglie.
      onChange([...base, s.free]);
      onChange([...base, stroke]);
    } else {
      onChange([...base, stroke]);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className={`${className}${active ? " is-active" : ""}${active && tool === "eraser" ? " is-eraser" : ""}`}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    />
  );
}

export default InkLayer;
