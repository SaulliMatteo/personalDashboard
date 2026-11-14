import { useState } from "react";
import { useElementSize } from "../../../core/hooks/useElementSize";
import { HISTORY_WINDOW_MS, type HistoryPoint } from "../lib/history";

/**
 * Grafico degli ultimi 60 s, una forma per tema (docs/mockup/temi/sysmon.html): Notte linea con velo, Opaco area
 * piena, Quaderno linea a inchiostro, Fosforo colonne di punti. Disegnato in pixel veri (niente tratti stirati):
 * misura il contenitore. Un dato mancante (null) lascia un buco, non uno 0. Scala fissa 0-100.
 */
export interface ChartProps {
  points: readonly HistoryPoint[];
  className?: string;
  label?: string;
}

const PAD = 2;
const DOT = 7;

/** Segmenti continui (un null spezza la linea), già in pixel. */
function segments(points: readonly HistoryPoint[], width: number, height: number): [number, number][][] {
  if (points.length === 0) return [];
  const end = points[points.length - 1].atMs;
  const out: [number, number][][] = [];
  let current: [number, number][] = [];
  for (const p of points) {
    if (p.value == null) {
      if (current.length) out.push(current);
      current = [];
      continue;
    }
    const x = (1 - (end - p.atMs) / HISTORY_WINDOW_MS) * width;
    const v = Math.min(100, Math.max(0, p.value));
    const y = height - PAD - (v / 100) * (height - PAD * 2);
    current.push([x, y]);
  }
  if (current.length) out.push(current);
  return out;
}

const toPoints = (seg: [number, number][]) => seg.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

function useBox() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  return { ref: setEl, ...useElementSize(el) };
}

/** Linee e aree: le tre forme "a tratto" differiscono solo per riempimento e colore. */
function LineChart({ points, className, label, fill, stroke, width: strokeWidth }: ChartProps & { fill: string | null; stroke: string; width: number }) {
  const { ref, width, height } = useBox();
  const segs = width > 0 && height > 0 ? segments(points, width, height) : [];
  return (
    <div ref={ref} className={`smw-chart ${className ?? ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {width > 0 && (
        <svg width={width} height={height}>
          {segs.map((seg, i) => (
            <g key={i}>
              {fill && seg.length > 1 && (
                <polygon points={`${seg[0][0]},${height} ${toPoints(seg)} ${seg[seg.length - 1][0]},${height}`} fill={fill} />
              )}
              {seg.length === 1 ? (
                <circle cx={seg[0][0]} cy={seg[0][1]} r={strokeWidth} fill={stroke} />
              ) : (
                <polyline points={toPoints(seg)} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

function ChartNotte(props: ChartProps) {
  return <LineChart {...props} fill="var(--accent-soft)" stroke="var(--accent)" width={1.8} />;
}

function ChartOpaco(props: ChartProps) {
  return <LineChart {...props} fill="var(--pg-dark, var(--track))" stroke="var(--text-primary)" width={2.2} />;
}

function ChartQuaderno(props: ChartProps) {
  return <LineChart {...props} fill={null} stroke="var(--accent)" width={1.8} />;
}

/** Fosforo: una colonna di punti ogni 7 px; la colonna prende il valore del campione più vicino nel tempo. */
function ChartFosforo({ points, className, label }: ChartProps) {
  const { ref, width, height } = useBox();
  const cols = Math.floor(width / DOT);
  const rows = Math.floor(height / DOT);
  const dots: { x: number; y: number; on: boolean }[] = [];
  if (cols > 0 && rows > 0 && points.length > 0) {
    const end = points[points.length - 1].atMs;
    const first = points[0].atMs;
    for (let c = 0; c < cols; c++) {
      const at = end - (1 - (c + 1) / cols) * HISTORY_WINDOW_MS;
      let lit = 0;
      if (at >= first - HISTORY_WINDOW_MS / cols) {
        let best = points[0];
        for (const p of points) if (Math.abs(p.atMs - at) < Math.abs(best.atMs - at)) best = p;
        if (best.value != null) lit = Math.max(1, Math.round((Math.min(100, best.value) / 100) * rows));
      }
      for (let r = 0; r < rows; r++) dots.push({ x: c * DOT + DOT / 2, y: height - r * DOT - DOT / 2, on: r < lit });
    }
  }
  return (
    <div ref={ref} className={`smw-chart ${className ?? ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {width > 0 && (
        <svg width={width} height={height}>
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={2.1} fill={d.on ? "var(--dot-on)" : "var(--dot-off)"} />
          ))}
        </svg>
      )}
    </div>
  );
}

export { ChartFosforo, ChartNotte, ChartOpaco, ChartQuaderno };
