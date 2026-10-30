import type { ReactNode } from "react";
import { shortcutKeys, shortcutLabel, type ShortcutAction } from "../lib/shortcuts";

/** Nomi dei tasti per aria-keyshortcuts (standard ARIA, non quelli mostrati). */
const ARIA_KEYS: Record<string, string> = {
  Ctrl: "Control",
  "⌘": "Meta",
  "⇧": "Shift",
  "⌥": "Alt",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  PagSu: "PageUp",
  "PagGiù": "PageDown",
  Invio: "Enter",
  Esc: "Escape",
  "−": "-",
};

interface ToolButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Scorciatoia (lib/shortcuts.ts): va nel tooltip e, in Fosforo, è scritta sotto il tasto. */
  shortcut?: ShortcutAction;
  /** Legenda breve per i pulsanti senza scorciatoia (Fosforo): "colore", "file"… */
  legend?: string;
  /** Testo accanto all'icona (pulsanti larghi). */
  text?: string;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Pulsante della barra strumenti delle note: icona + legenda (visibile solo dove il tema la prevede). */
function ToolButton({ label, icon, onClick, shortcut, legend, text, pressed, disabled, className }: ToolButtonProps) {
  const keys = shortcut ? shortcutLabel(shortcut) : legend;
  return (
    <button
      type="button"
      className={`nq-tb${text ? " nq-tb--wide" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
      aria-keyshortcuts={shortcut ? shortcutKeys(shortcut).map((k) => ARIA_KEYS[k] ?? k).join("+") : undefined}
      title={shortcut ? `${label} (${shortcutLabel(shortcut)})` : label}
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
