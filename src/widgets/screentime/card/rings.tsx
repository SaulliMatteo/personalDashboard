import type { ReactNode } from "react";
import type { RingClass, RingColor, RingPart } from "./ringParts";

/**
 * Anello del widget, una forma per tema (docs/mockup/widget/tempo-allo-schermo.html): il giro è diviso tra i pezzi.
 * Serve per le classi della giornata (Piccola) e per riempire una sola quantità (il focus della Media: il resto è
 * "off", spento). Notte archi sottili staccati, Opaco spessi a taglio netto, Quaderno tacche (focus più lunghe),
 * Fosforo un cerchio di punti, Vetro un tubo col filo di vetro, Ombra di notte un'eclisse (disco nero con la corona
 * luminosa), Ombra di giorno una stella di raggi (i più lunghi per il focus).
 */
export interface RingProps {
  parts: RingPart[];
  label: string;
  children?: ReactNode;
}

const VAR: Record<RingColor, string> = { focus: "var(--st-focus)", fun: "var(--st-fun)", neutral: "var(--st-neutral)", warn: "var(--st-warn)" };

const sum = (parts: RingPart[]) => parts.reduce((s, p) => s + p.value, 0);

function Frame({ label, children, ring }: { label: string; children?: ReactNode; ring: ReactNode }) {
  return (
    <div className="stw-ring">
      <svg viewBox="0 0 100 100" role="img" aria-label={label}>
        {ring}
      </svg>
      {children && <div className="stw-ring-val">{children}</div>}
    </div>
  );
}

interface ArcStyle {
  thick: number;
  gap: number;
  cap: "round" | "butt";
  /** Distanza dal bordo del riquadro. */
  margin?: number;
  /** Alone sugli archi (`filter` CSS), per classe. */
  glow?: (cls: RingColor) => string | undefined;
}

function arcs(parts: RingPart[], { thick, gap, cap, margin = 1, glow }: ArcStyle) {
  const total = sum(parts);
  const r = 50 - thick / 2 - margin;
  const c = 2 * Math.PI * r;
  const inset = cap === "round" ? thick : 0;
  let start = 0;
  return (
    <>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--st-track)" strokeWidth={thick} />
      {total > 0 &&
        parts.map((part, i) => {
          const len = (c * part.value) / total;
          const offset = start;
          start += len;
          if (len <= 0 || part.cls === "off") return null;
          // Con un solo pezzo l'anello è pieno: niente spazi.
          const single = len >= c - 0.01;
          const dash = single ? c : Math.max(0.1, len - gap - inset);
          const filter = glow?.(part.cls);
          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={VAR[part.cls]}
              strokeWidth={thick}
              strokeLinecap={single ? "butt" : cap}
              strokeDasharray={`${dash} ${c}`}
              strokeDashoffset={single ? 0 : -offset - inset / 2}
              transform="rotate(-90 50 50)"
              style={filter ? { filter } : undefined}
            />
          );
        })}
    </>
  );
}

/** Classe in cui cade la frazione `f` (0-1) del giro; null senza tempo. */
function classAt(parts: RingPart[], f: number): RingClass | null {
  const total = sum(parts);
  if (total <= 0) return null;
  let acc = 0;
  for (const part of parts) {
    acc += part.value / total;
    if (f <= acc + 1e-9) return part.cls;
  }
  return parts[parts.length - 1]?.cls ?? null;
}

/** Tacche o raggi tutto intorno: lunghezza e spessore per classe. */
function rays(
  parts: RingPart[],
  n: number,
  r1: number,
  shape: (cls: RingClass | null) => { r2: number; width: number; stroke: string; glow?: string }
) {
  return Array.from({ length: n }, (_, i) => {
    const f = (i + 0.5) / n;
    const { r2, width, stroke, glow } = shape(classAt(parts, f));
    const a = f * Math.PI * 2 - Math.PI / 2;
    return (
      <line
        key={i}
        x1={50 + Math.cos(a) * r1}
        y1={50 + Math.sin(a) * r1}
        x2={50 + Math.cos(a) * r2}
        y2={50 + Math.sin(a) * r2}
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        style={glow ? { filter: glow } : undefined}
      />
    );
  });
}

export function RingNotte(props: RingProps) {
  const glow = (cls: RingColor) => `drop-shadow(0 0 3px color-mix(in srgb, ${VAR[cls]} 50%, transparent))`;
  return <Frame {...props} ring={arcs(props.parts, { thick: 7, gap: 5, cap: "round", glow })} />;
}

export function RingOpaco(props: RingProps) {
  return <Frame {...props} ring={arcs(props.parts, { thick: 13, gap: 0, cap: "butt" })} />;
}

export function RingQuaderno(props: RingProps) {
  const ticks = rays(props.parts, 40, 37, (cls) => ({
    r2: cls === "focus" || cls === "warn" ? 48 : 45,
    width: cls === "focus" || cls === "warn" ? 2.4 : 1.8,
    stroke: cls === "focus" || cls === "fun" || cls === "warn" ? VAR[cls] : "var(--tick-off)",
  }));
  return <Frame {...props} ring={ticks} />;
}

export function RingFosforo(props: RingProps) {
  const n = 28;
  const dots = Array.from({ length: n }, (_, i) => {
    const f = (i + 0.5) / n;
    const cls = classAt(props.parts, f);
    const a = f * Math.PI * 2 - Math.PI / 2;
    const fill = cls && cls !== "off" ? VAR[cls] : "var(--dot-off)";
    return <circle key={i} cx={50 + Math.cos(a) * 43} cy={50 + Math.sin(a) * 43} r="3.1" fill={fill} />;
  });
  return <Frame {...props} ring={dots} />;
}

/** Vetro: un tubo con i due fili chiari del vetro, dentro e fuori. */
export function RingVetro(props: RingProps) {
  const thick = 10;
  const r = 50 - thick / 2 - 1;
  return (
    <Frame
      {...props}
      ring={
        <>
          {arcs(props.parts, { thick, gap: 3, cap: "round" })}
          <circle cx="50" cy="50" r={r - thick / 2 - 0.6} fill="none" stroke="var(--glass-line)" strokeWidth="0.8" />
          <circle cx="50" cy="50" r={r + thick / 2 + 0.6} fill="none" stroke="var(--glass-line)" strokeWidth="0.8" />
        </>
      }
    />
  );
}

/** Ombra di notte: eclisse, un disco nero con la corona sottile; il focus brilla. */
export function RingEclisse(props: RingProps) {
  const thick = 2.4;
  const r = 50 - thick / 2 - 3;
  const glow = (cls: RingColor) => (cls === "focus" || cls === "warn" ? "drop-shadow(0 0 3px var(--core-glow))" : undefined);
  return (
    <Frame
      {...props}
      ring={
        <>
          <circle cx="50" cy="50" r={r - 6} fill="var(--core-fill)" stroke="var(--st-track)" strokeWidth="1" />
          {arcs(props.parts, { thick, gap: 7, cap: "butt", margin: 3, glow })}
        </>
      }
    />
  );
}

/** Ombra di giorno: stella di raggi con l'alone dorato dietro; il focus ha i raggi più lunghi e la fiamma. */
export function RingStella(props: RingProps) {
  const lines = rays(props.parts, 36, 37, (cls) => ({
    r2: cls === "focus" || cls === "warn" ? 49 : cls === "fun" ? 45.5 : cls === "neutral" ? 43 : 41,
    width: cls === "focus" || cls === "warn" ? 2.6 : 1.7,
    stroke: cls && cls !== "off" ? VAR[cls] : "var(--tick-off)",
    glow: cls === "focus" || cls === "warn" ? "drop-shadow(0 0 2.5px var(--prog-glow))" : undefined,
  }));
  return (
    <Frame
      {...props}
      ring={
        <>
          <circle cx="50" cy="50" r="30" fill="var(--wall-top)" />
          {lines}
        </>
      }
    />
  );
}
