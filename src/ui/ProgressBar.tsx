import type { CSSProperties } from "react";
import "./progressBar.css";

interface ProgressBarProps {
  /** Avanzamento 0..1. */
  value: number;
  className?: string;
  label?: string;
}

/**
 * Barra di avanzamento nella forma del tema (progressBar.css): sottile in
 * Notte, a pillola in Opaco, contorno a penna in Quaderno, celle in Fosforo.
 */
function ProgressBar({ value, className = "", label }: ProgressBarProps) {
  const p = Math.min(1, Math.max(0, value));
  return (
    <div
      className={`pbar ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      style={{ "--p": p } as CSSProperties}
    >
      <div className="pbar-fill" />
    </div>
  );
}

export default ProgressBar;
