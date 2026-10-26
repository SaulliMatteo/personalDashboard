import { useThemeVariant, type ThemeVariants } from "../../../core/theme/variants";
import "./UnsavedNotice.css";

type Mark = "icon" | "none" | "hand" | "led";

/** Il segno che apre l'avviso, per tema: triangolo (Notte), niente (Opaco), "Attenzione!" a mano (Quaderno), LED (Fosforo). */
const MARKS: ThemeVariants<Mark> = { notte: "icon", opaco: "none", quaderno: "hand", fosforo: "led" };

function WarnIcon() {
  return (
    <svg className="wb-notice-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 10v4.2M12 16.9v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Avviso sempre visibile nella pagina della Lavagna: il disegno non si salva.
 * Stesso testo in tutti i temi, cambia la forma (mockup, "Avviso").
 */
function UnsavedNotice() {
  const mark = useThemeVariant(MARKS);
  return (
    <div className="wb-notice" role="note">
      {mark === "icon" && <WarnIcon />}
      {mark === "hand" && (
        <span className="wb-notice-hand" aria-hidden="true">
          Attenzione!
        </span>
      )}
      {mark === "led" && <span className="wb-notice-led" aria-hidden="true" />}
      <span>
        <strong>Questa lavagna non viene salvata.</strong> Quando torni alla dashboard o chiudi l'app, il disegno si
        cancella.
      </span>
    </div>
  );
}

export default UnsavedNotice;
