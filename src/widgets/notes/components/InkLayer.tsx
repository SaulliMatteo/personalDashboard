import { useEffect, useRef, type PointerEvent } from "react";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import type { InkStroke } from "../data/notesRepository";
import { REF_WIDTH, drawStrokes } from "../lib/ink";

export type InkTool = "pen" | "highlighter" | "eraser";

function paint(canvas: HTMLCanvasElement, strokes: readonly InkStroke[]) {
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
  drawStrokes(ctx, w, strokes);
}

interface InkLayerProps {
  strokes: InkStroke[];
  /** True = intercetta penna/dito/mouse; false = lascia passare i click al testo. */
  active: boolean;
  tool: InkTool;
  color: string;
  size: number;
  onChange: (strokes: InkStroke[]) => void;
}

function InkLayer({ strokes, active, tool, color, size, onChange }: InkLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useLatestRef(strokes);
  const live = useRef<InkStroke | null>(null);
  const erasing = useRef(false);

  useEffect(() => {
    if (canvasRef.current) paint(canvasRef.current, strokes);
  }, [strokes]);

  // La pagina cambia altezza mentre si scrive: il canvas va ridisegnato.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() =>
      paint(canvas, live.current ? [...strokesRef.current, live.current] : strokesRef.current)
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [strokesRef]);

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
    if (canvasRef.current) paint(canvasRef.current, [...strokesRef.current, live.current]);
  }

  function handleMove(e: PointerEvent<HTMLCanvasElement>) {
    const p = pointOf(e);
    if (erasing.current) {
      eraseAt(p);
      return;
    }
    const stroke = live.current;
    if (!stroke) return;
    const last = stroke.points[stroke.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.0008) return;
    stroke.points.push(p);
    if (canvasRef.current) paint(canvasRef.current, [...strokesRef.current, stroke]);
  }

  function handleUp() {
    erasing.current = false;
    const stroke = live.current;
    live.current = null;
    if (stroke) onChange([...strokesRef.current, stroke]);
  }

  return (
    <canvas
      ref={canvasRef}
      className={`nq-ink${active ? " is-active" : ""}${active && tool === "eraser" ? " is-eraser" : ""}`}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    />
  );
}

export default InkLayer;
