import { useState, type ReactNode } from "react";
import { useElementSize } from "../../../../core/hooks/useElementSize";
import "./dials.css";

const TICKS = 60;

interface DialProps {
  /** Lato del quadrante in px. */
  size: number;
  /** Avanzamento della fase, 0..1. */
  progress: number;
  /** Tempo, fase, materia: stanno al centro. I testi dimensionati in `cqw` scalano col quadrante. */
  children?: ReactNode;
}

/**
 * Spazio che il quadrante può occupare: il lato è il più grande quadrato
 * che ci sta, fino a `max` (la misura dei mockup).
 */
export function DialFit({ max, children }: { max: number; children: (size: number) => ReactNode }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const { width, height } = useElementSize(element);
  const size = Math.floor(Math.min(max, width || max, height || max));
  return (
    // maxHeight: lo spazio non cresce oltre il quadrante, così i pulsanti restano attaccati sotto.
    <div ref={setElement} className="dial-fit" style={{ maxHeight: max }}>
      {size > 0 && children(size)}
    </div>
  );
}

function litCount(progress: number) {
  return Math.round(Math.min(1, Math.max(0, progress)) * TICKS);
}

/** Notte: ghiera di 60 tacche (ogni 5 una lunga) e disco interno col tempo. */
export function TickDial({ size, progress, children }: DialProps) {
  const lit = litCount(progress);
  return (
    <div className="dial tick-dial" style={{ width: size, height: size }}>
      <svg className="dial-svg" viewBox="0 0 236 236" aria-hidden="true">
        {Array.from({ length: TICKS }, (_, i) => {
          const isLong = i % 5 === 0;
          const cls = i < lit ? "is-on" : isLong ? "is-off-long" : "is-off";
          return (
            <rect key={i} className={cls} x={117} y={2} width={2} height={isLong ? 12 : 6} rx={1} transform={`rotate(${i * 6} 118 118)`} />
          );
        })}
      </svg>
      <div className="tick-dial-disc">{children}</div>
    </div>
  );
}

// Cerchio "tracciato a penna": leggermente irregolare, come nel mockup.
const PEN_PATH = "M108 9 C165 6 209 52 207 109 C205 166 161 209 106 207 C51 205 7 163 9 106 C11 52 55 11 108 9 Z";

/** Quaderno: cerchio a penna con traccia tratteggiata e progresso in inchiostro. */
export function PenDial({ size, progress, children }: DialProps) {
  const p = Math.min(1, Math.max(0, progress)) * 100;
  return (
    <div className="dial pen-dial" style={{ width: size, height: size }}>
      <svg className="dial-svg" viewBox="0 0 216 216" aria-hidden="true">
        <path className="pen-dial-track" d={PEN_PATH} />
        {p > 0 && <path className="pen-dial-ink" d={PEN_PATH} pathLength={100} strokeDasharray={`${p} 100`} />}
      </svg>
      <div className="dial-center">{children}</div>
    </div>
  );
}

/**
 * Fosforo: 60 puntini in cerchio, accesi quelli trascorsi. L'ultimo acceso è
 * il LED rosso (più grande) solo mentre il timer corre.
 */
export function DotDial({ size, progress, running, children }: DialProps & { running: boolean }) {
  const lit = litCount(progress);
  return (
    <div className="dial dot-dial" style={{ width: size, height: size }}>
      <svg className="dial-svg" viewBox="0 0 220 220" aria-hidden="true">
        {Array.from({ length: TICKS }, (_, i) => {
          const angle = (i / TICKS) * Math.PI * 2;
          const cx = 110 + 102 * Math.sin(angle);
          const cy = 110 - 102 * Math.cos(angle);
          const isLed = running && i === lit - 1;
          const cls = isLed ? "is-led" : i < lit ? "is-on" : "is-off";
          return <circle key={i} className={cls} cx={cx} cy={cy} r={isLed ? 4 : 2.5} />;
        })}
      </svg>
      <div className="dial-center">{children}</div>
    </div>
  );
}
