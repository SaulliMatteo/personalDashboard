import { useId, useState, type ReactNode } from "react";
import { useElementSize } from "../../../../core/hooks/useElementSize";
import "./dials.css";

const TICKS = 60;

export interface DialProps {
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

const GLASS_R = 80;
const GLASS_C = 2 * Math.PI * GLASS_R;

/**
 * Vetro: un tubo di vetro (Temi Vetro e Ombra.html, `dial`). Traccia spessa, progresso sfumato tra i due accent
 * con un alone, riflesso in alto a sinistra e una perla lucida sulla punta.
 */
export function GlassDial({ size, progress, children }: DialProps) {
  const p = Math.min(1, Math.max(0, progress));
  // gli id di useId hanno caratteri che dentro url(#...) non vanno bene
  const id = `gd${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const angle = ((-90 + 360 * p) * Math.PI) / 180;
  const ex = 100 + GLASS_R * Math.cos(angle);
  const ey = 100 + GLASS_R * Math.sin(angle);
  const dash = `${GLASS_C * p} ${GLASS_C}`;
  return (
    <div className="dial glass-dial" style={{ width: size, height: size }}>
      <svg className="dial-svg" viewBox="0 0 200 200" aria-hidden="true" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" />
          </linearGradient>
          <filter id={`${id}s`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <circle className="glass-dial-track" cx="100" cy="100" r={GLASS_R} />
        {p > 0 && (
          <>
            <circle className="glass-dial-ink" cx="100" cy="100" r={GLASS_R} stroke={`url(#${id}g)`} strokeDasharray={dash} filter={`url(#${id}s)`} opacity=".55" transform="rotate(-90 100 100)" />
            <circle className="glass-dial-ink" cx="100" cy="100" r={GLASS_R} stroke={`url(#${id}g)`} strokeDasharray={dash} transform="rotate(-90 100 100)" />
          </>
        )}
        <circle className="glass-dial-shine" cx="100" cy="100" r={GLASS_R + 5} strokeDasharray={`${GLASS_C * 0.16} ${GLASS_C * 2}`} transform="rotate(-160 100 100)" />
        <circle className="glass-dial-inner" cx="100" cy="100" r={GLASS_R - 6} />
        <circle className="glass-dial-knob" cx={ex} cy={ey} r="11" />
        <circle className="glass-dial-knob-dot" cx={ex - 3} cy={ey - 3} r="3" />
      </svg>
      <div className="dial-center">{children}</div>
    </div>
  );
}

const CORE_R = 88;
const CORE_C = 2 * Math.PI * CORE_R;
/** 24 raggi attorno al nucleo, alternati lunghi e corti. */
const CORE_RAYS = Array.from({ length: 24 }, (_, k) => {
  const a = (k / 24) * Math.PI * 2;
  const l = k % 2 ? 8 : 15;
  return { x1: 100 + 62 * Math.cos(a), y1: 100 + 62 * Math.sin(a), x2: 100 + (62 + l) * Math.cos(a), y2: 100 + (62 + l) * Math.sin(a) };
});

/**
 * Ombra: il nucleo (Temi Vetro e Ombra.html, `dial` di Ombra). Un disco con la corona di raggi e l'alone; il
 * progresso è un filo sottile luminoso con un punto in testa. Eclisse nera di notte, globo bianco di giorno:
 * cambiano solo i token `--core-fill/-ink/-glow`.
 */
export function CoreDial({ size, progress, children }: DialProps) {
  const p = Math.min(1, Math.max(0, progress));
  const id = `cd${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const angle = ((-90 + 360 * p) * Math.PI) / 180;
  const dash = `${CORE_C * p} ${CORE_C}`;
  return (
    <div className="dial core-dial" style={{ width: size, height: size }}>
      <svg className="dial-svg" viewBox="0 0 200 200" aria-hidden="true" style={{ overflow: "visible" }}>
        <defs>
          <filter id={`${id}h`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id={`${id}l`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <circle className="core-dial-track" cx="100" cy="100" r={CORE_R} />
        {p > 0 && (
          <>
            <circle className="core-dial-glow" cx="100" cy="100" r={CORE_R} strokeDasharray={dash} transform="rotate(-90 100 100)" filter={`url(#${id}l)`} />
            <circle className="core-dial-ink" cx="100" cy="100" r={CORE_R} strokeDasharray={dash} transform="rotate(-90 100 100)" />
          </>
        )}
        <circle className="core-dial-head" cx={100 + CORE_R * Math.cos(angle)} cy={100 + CORE_R * Math.sin(angle)} r="4" />
        <g className="core-dial-rays" filter={`url(#${id}l)`}>
          {CORE_RAYS.map((r, i) => (
            <line key={i} {...r} />
          ))}
        </g>
        <circle className="core-dial-halo" cx="100" cy="100" r="64" filter={`url(#${id}h)`} />
        <circle className="core-dial-disc" cx="100" cy="100" r="61" />
      </svg>
      <div className="dial-center core-dial-center">{children}</div>
    </div>
  );
}

/** Spessore dell'anello di Opaco: lo stesso della barra .so-bar del widget. */
const RING_STROKE = 16;

/**
 * Opaco: il timer non ha un quadrante (tempo enorme e barra), qui serve un anello pieno
 * con lo spessore della barra. Il progresso parte da ore 12, con le estremità arrotondate.
 */
export function RingDial({ size, progress, children }: DialProps) {
  const p = Math.min(1, Math.max(0, progress)) * 100;
  const c = size / 2;
  const r = c - RING_STROKE / 2;
  return (
    <div className="dial ring-dial" style={{ width: size, height: size }}>
      <svg className="dial-svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-dial-track" cx={c} cy={c} r={r} strokeWidth={RING_STROKE} />
        {p > 0 && (
          <circle
            className="ring-dial-ink"
            cx={c}
            cy={c}
            r={r}
            strokeWidth={RING_STROKE}
            pathLength={100}
            strokeDasharray={`${p} 100`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
      </svg>
      <div className="dial-center">{children}</div>
    </div>
  );
}
