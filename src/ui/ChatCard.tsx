import type { ReactNode } from "react";
import "./ChatCard.css";

interface ChatCardProps {
  /** Da quale widget arriva, es. "YouTube" (in alto, con l'icona). */
  source: string;
  icon: ReactNode;
  children: ReactNode;
  /** Pulsanti in fondo (ChatCardButton). */
  actions?: ReactNode;
}

/**
 * Scheda di un widget dentro la chat degli amici (docs/mockup/gruppi/amici-notifiche.html, viste 3 e 9): da dove viene, il
 * contenuto e i pulsanti. Il pigmento (Opaco) lo mette chi la contiene con `data-pigment`.
 */
export function ChatCard({ source, icon, children, actions }: ChatCardProps) {
  return (
    <div className="chcard">
      <div className="chcard-from">
        <span aria-hidden="true">{icon}</span>
        {source}
      </div>
      {children}
      {actions && <div className="chcard-actions">{actions}</div>}
    </div>
  );
}

interface ChatCardButtonProps {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}

export function ChatCardButton({ children, onClick, primary = false, disabled = false }: ChatCardButtonProps) {
  return (
    <button
      type="button"
      className={`chcard-btn${primary ? " chcard-btn--primary" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** Titolo e riga sotto (es. titolo del video e canale). */
export function ChatCardText({ title, sub }: { title: string; sub?: string | null }) {
  return (
    <div className="chcard-text">
      <b>{title}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

/** Riga d'errore della scheda (es. salvataggio non riuscito). */
export function ChatCardError({ children }: { children: ReactNode }) {
  return (
    <p className="chcard-error" role="alert">
      {children}
    </p>
  );
}
