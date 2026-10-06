import type { ReactNode } from "react";
import "../../css/TimerRing.css";

interface TimerRingProps {
  /** 0..1 */
  progress: number;
  size: number;
  strokeWidth: number;
  color: string;
  children?: ReactNode;
  /**
   * Se impostato, l'anello non si chiude: lascia un'apertura di questi
   * gradi centrata in basso, invece di un cerchio completo. Pensata per
   * ospitare dei controlli proprio nell'apertura (vedi il widget 1x1).
   * Omesso o 0 = cerchio pieno (comportamento invariato per 2x2 e
   * dettaglio, che non passano questa prop).
   */
  gapDegrees?: number;
}

function TimerRing({ progress, size, strokeWidth, color, children, gapDegrees = 0 }: TimerRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));

  // Nessuna apertura: comportamento originale, invariato.
  const arcFraction = gapDegrees > 0 ? (360 - gapDegrees) / 360 : 1;
  const arcLength = circumference * arcFraction;
  // Il tratteggio SVG di un <circle> parte nativamente dal punto delle
  // ore 3 (angolo 0 in senso orario); ruotando di (90 + gapDegrees/2) lo
  // spostiamo esattamente al margine dell'apertura, così l'arco visibile
  // finisce per essere centrato in alto con il vuoto in basso. Con
  // gapDegrees=0 questo si riduce a 90°, diverso dal -90° originale ma
  // equivalente: ruota solo il punto di partenza del trattino, che per un
  // cerchio pieno (dasharray = intera circonferenza) non ha alcun effetto
  // visibile.
  const rotation = gapDegrees > 0 ? 90 + gapDegrees / 2 : -90;
  const trackDasharray = gapDegrees > 0 ? `${arcLength} ${circumference}` : `${circumference}`;
  const progressOffset = gapDegrees > 0 ? arcLength * (1 - clamped) : circumference * (1 - clamped);

  return (
    <div className="timer-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={strokeWidth}
          strokeDasharray={trackDasharray}
          strokeLinecap={gapDegrees > 0 ? "round" : undefined}
          transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
        />
        <circle
          className="timer-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={gapDegrees > 0 ? `${arcLength} ${circumference}` : circumference}
          strokeDashoffset={progressOffset}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="timer-ring-content">{children}</div>
    </div>
  );
}

export default TimerRing;
