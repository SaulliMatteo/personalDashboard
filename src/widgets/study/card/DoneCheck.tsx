/** Spunta a tratto dell'obiettivo raggiunto; il colore lo dà la card (`--success-text`). */
function DoneCheck({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 6.4 4.8 9 10 3" />
    </svg>
  );
}

export default DoneCheck;
