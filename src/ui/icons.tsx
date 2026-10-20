/**
 * Icone dei controlli disegnate come nei mockup dei temi (viewBox 24).
 * `round` è il raggio degli angoli: ogni tema ha il suo (0 in Fosforo).
 */
interface IconProps {
  size: number;
  round?: number;
}

export function PlayIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

export function PauseIcon({ size, round = 1 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx={round} />
      <rect x="14" y="5" width="4" height="14" rx={round} />
    </svg>
  );
}

export function StopIcon({ size, round = 2 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx={round} />
    </svg>
  );
}

export function SkipIcon({ size, round = 1 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5.5v13l9-6.5z" />
      <rect x="16" y="5.5" width="3" height="13" rx={round} />
    </svg>
  );
}
