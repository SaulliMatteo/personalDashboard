import type { ReactNode } from "react";

/**
 * Anello della taglia Piccola, una forma per tema (docs/mockup/temi/sysmon.html): Notte sottile e arrotondato,
 * Opaco spesso a taglio netto, Quaderno tacche come sul quadrante, Fosforo un cerchio di punti.
 * `value` 0-100; null = anello vuoto (il numero al centro dice "—").
 */
export interface GaugeProps {
  value: number | null;
  hot: boolean;
  label: string;
  /** Il numero al centro. */
  children?: ReactNode;
}

const clamp = (v: number | null) => (v == null ? 0 : Math.min(100, Math.max(0, v)));

function Frame({ label, value, children, ring }: GaugeProps & { ring: ReactNode }) {
  return (
    <div className="smw-gauge">
      <svg viewBox="0 0 100 100" role="img" aria-label={value == null ? `${label}: non disponibile` : `${label} ${Math.round(value)} per cento`}>
        {ring}
      </svg>
      <div className="smw-gauge-val">{children}</div>
    </div>
  );
}

function ring(props: GaugeProps, thick: number, track: string, cap: "round" | "butt") {
  const r = 50 - thick / 2 - 1;
  const c = 2 * Math.PI * r;
  const stroke = props.hot ? "var(--smw-hot)" : "var(--accent)";
  const v = clamp(props.value);
  return (
    <Frame
      {...props}
      ring={
        <>
          <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={thick} />
          {v > 0 && (
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={stroke}
              strokeWidth={thick}
              strokeLinecap={cap}
              strokeDasharray={`${(c * v) / 100} ${c}`}
              transform="rotate(-90 50 50)"
            />
          )}
        </>
      }
    />
  );
}

function GaugeNotte(props: GaugeProps) {
  return ring(props, 7, "var(--track)", "round");
}

function GaugeOpaco(props: GaugeProps) {
  return ring(props, 13, "var(--pg-dark, var(--track))", "butt");
}

/** Posizione sul cerchio, partendo da mezzogiorno. */
const at = (i: number, n: number, r: number) => {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r] as const;
};

function GaugeQuaderno(props: GaugeProps) {
  const n = 36;
  const lit = Math.round((clamp(props.value) / 100) * n);
  const on = props.hot ? "var(--smw-hot)" : "var(--accent)";
  const ticks = Array.from({ length: n }, (_, i) => {
    const [x1, y1] = at(i, n, 36);
    const [x2, y2] = at(i, n, i < lit ? 47 : 44);
    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={i < lit ? on : "var(--tick-off)"}
        strokeWidth={i < lit ? 2.4 : 1.6}
        strokeLinecap="round"
      />
    );
  });
  return <Frame {...props} ring={ticks} />;
}

function GaugeFosforo(props: GaugeProps) {
  const n = 24;
  const lit = Math.round((clamp(props.value) / 100) * n);
  const on = props.hot ? "var(--led)" : "var(--dot-on)";
  const dots = Array.from({ length: n }, (_, i) => {
    const [cx, cy] = at(i, n, 42);
    return <circle key={i} cx={cx} cy={cy} r={3.4} fill={i < lit ? on : "var(--dot-off)"} />;
  });
  return <Frame {...props} ring={dots} />;
}

export { GaugeFosforo, GaugeNotte, GaugeOpaco, GaugeQuaderno };
