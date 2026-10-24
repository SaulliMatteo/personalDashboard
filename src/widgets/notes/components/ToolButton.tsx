import type { ReactNode } from "react";

interface ToolButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Scorciatoia o etichetta breve: nel tooltip e, in Fosforo, scritta sotto il tasto. */
  keys?: string;
  /** Testo accanto all'icona (pulsanti larghi). */
  text?: string;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Pulsante della barra strumenti delle note: icona + legenda (visibile solo dove il tema la prevede). */
function ToolButton({ label, icon, onClick, keys, text, pressed, disabled, className }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`nq-tb${text ? " nq-tb--wide" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={keys && keys.length > 0 && /ctrl|⇧|alt|cmd|^[a-z]$/i.test(keys) ? `${label} (${keys})` : label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="nq-tb-face">
        {icon}
        {text && <span className="nq-tb-text">{text}</span>}
      </span>
      {keys && <span className="nq-kc" aria-hidden="true">{keys}</span>}
    </button>
  );
}

export default ToolButton;
