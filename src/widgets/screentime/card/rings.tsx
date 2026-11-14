import type { ReactNode } from "react";
import type { ClassSeconds } from "../lib/summary";
import type { FocusClass } from "../lib/focus";

/**
 * Anello della Piccola, una forma per tema (docs/mockup/temi/tempo-pc.html): il giro è diviso tra focus, svago e
 * neutro. Notte archi sottili staccati, Opaco spessi a taglio netto, Quaderno tacche (focus più lunghe), Fosforo
 * un cerchio di punti. Senza tempo l'anello resta vuoto.
 */
export interface RingProps {
  byClass: ClassSeconds;
  label: string;
  children?: ReactNode;
}

const ORDER: FocusClass[] = ["focus", "fun", "neutral"];
const VAR: Record<FocusClass, string> = { focus: "var(--st-focus)", fun: "var(--st-fun)", neutral: "var(--st-neutral)" };

function Frame({ label, children, ring }: { label: string; children?: ReactNode; ring: ReactNode }) {
  return (
    <div className="stw-ring">
      <svg viewBox="0 0 100 100" role="img" aria-label={label}>
        {ring}
      </svg>
      <div className="stw-ring-val">{children}</div>
    </div>
  );
}

function arcs({ byClass }: RingProps, thick: number, gap: number, cap: "round" | "butt") {
  const total = ORDER.reduce((s, c) => s + byClass[c], 0);
  const r = 50 - thick / 2 - 1;
  const c = 2 * Math.PI * r;
  const inset = cap === "round" ? thick : 0;
  let start = 0;
  return (
    <>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--st-track)" strokeWidth={thick} />
      {total > 0 &&
        ORDER.map((cls) => {
          const len = (c * byClass[cls]) / total;
          const offset = start;
          start += len;
          if (len <= 0) return null;
          // Con un solo pezzo l'anello è pieno: niente spazi.
          const single = len >= c - 0.01;
          const dash = single ? c : Math.max(0.1, len - gap - inset);
          return (
            <circle
              key={cls}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={VAR[cls]}
              strokeWidth={thick}
              strokeLinecap={single ? "butt" : cap}
              strokeDasharray={`${dash} ${c}`}
              strokeDashoffset={single ? 0 : -offset - inset / 2}
              transform="rotate(-90 50 50)"
            />
          );
        })}
    </>
  );
}

/** Classe in cui cade la frazione `f` (0-1) del giro. */
function classAt(byClass: ClassSeconds, f: number): FocusClass | null {
  const total = ORDER.reduce((s, c) => s + byClass[c], 0);
  if (total <= 0) return null;
  let acc = 0;
  for (const cls of ORDER) {
    acc += byClass[cls] / total;
    if (f <= acc + 1e-9) return cls;
  }
  return "neutral";
}

export function RingNotte(props: RingProps) {
  return <Frame {...props} ring={arcs(props, 7, 5, "round")} />;
}

export function RingOpaco(props: RingProps) {
  return <Frame {...props} ring={arcs(props, 13, 0, "butt")} />;
}

export function RingQuaderno(props: RingProps) {
  const n = 40;
  const ticks = Array.from({ length: n }, (_, i) => {
    const f = (i + 0.5) / n;
    const cls = classAt(props.byClass, f);
    const a = f * Math.PI * 2 - Math.PI / 2;
    const r1 = 37;
    const r2 = cls === "focus" ? 48 : 45;
    const stroke = cls === null || cls === "neutral" ? "var(--tick-off)" : VAR[cls];
    return (
      <line
        key={i}
        x1={50 + Math.cos(a) * r1}
        y1={50 + Math.sin(a) * r1}
        x2={50 + Math.cos(a) * r2}
        y2={50 + Math.sin(a) * r2}
        stroke={stroke}
        strokeWidth={cls === "focus" ? 2.4 : 1.8}
        strokeLinecap="round"
      />
    );
  });
  return <Frame {...props} ring={ticks} />;
}

export function RingFosforo(props: RingProps) {
  const n = 28;
  const dots = Array.from({ length: n }, (_, i) => {
    const f = (i + 0.5) / n;
    const cls = classAt(props.byClass, f);
    const a = f * Math.PI * 2 - Math.PI / 2;
    return <circle key={i} cx={50 + Math.cos(a) * 43} cy={50 + Math.sin(a) * 43} r="3.1" fill={cls ? VAR[cls] : "var(--dot-off)"} />;
  });
  return <Frame {...props} ring={dots} />;
}
