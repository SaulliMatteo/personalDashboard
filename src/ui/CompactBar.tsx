import type { ReactNode } from "react";
import { MdArrowBack, MdMenu } from "react-icons/md";
import "./CompactBar.css";

interface CompactBarProps {
  /** "menu": ☰ apre il menu (dashboard, Stanza comune); "back": ← torna indietro (catalogo, impostazioni, dettagli). */
  lead: "menu" | "back";
  onLead: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Pulsanti a destra (es. la matita della dashboard). */
  actions?: ReactNode;
}

/** Barra in alto del telefono (docs/design/mobile/viste.html): ☰ o ←, titolo nel font del tema, azioni. */
function CompactBar({ lead, onLead, title, subtitle, actions }: CompactBarProps) {
  return (
    <header className="cbar">
      <button type="button" className="cbar-btn" onClick={onLead} aria-label={lead === "menu" ? "Apri il menu" : "Indietro"}>
        {lead === "menu" ? <MdMenu /> : <MdArrowBack />}
      </button>
      <div className="cbar-title">
        <h1>{title}</h1>
        {subtitle && <small>{subtitle}</small>}
      </div>
      {actions}
    </header>
  );
}

export default CompactBar;
