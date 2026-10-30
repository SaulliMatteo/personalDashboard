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

/** "Ricevi": vassoio con freccia verso il basso, a tratto. `stroke` è lo spessore del tema. */
export function ReceiveIcon({ size, stroke = 1.6 }: { size: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5v10" />
      <path d="M7.5 9.5 12 14l4.5-4.5" />
      <path d="M4 14.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5" />
    </svg>
  );
}

/** "Ricevi" a matrice di punti 9×9 (Fosforo). */
const RECEIVE_PIXELS = [
  "....#....",
  "....#....",
  "..#.#.#..",
  "...###...",
  "....#....",
  ".........",
  "#.......#",
  "#.......#",
  "#########",
];

const RECEIVE_DOTS = RECEIVE_PIXELS.flatMap((row, y) =>
  [...row].flatMap((c, x) => (c === "#" ? [{ x: x + 0.5, y: y + 0.5 }] : []))
);

export function ReceiveDotsIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 9 9" fill="currentColor" aria-hidden="true">
      {RECEIVE_DOTS.map((d) => (
        <circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={0.38} />
      ))}
    </svg>
  );
}
