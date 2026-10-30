import { forwardRef } from "react";
import { MdOutlineAttachFile, MdOutlineImage } from "react-icons/md";
import "./DropOverlay.css";

export type DropZone = "insert" | "attach";

/**
 * Pannello mostrato trascinando file dal sistema sopra la pagina: a sinistra "Inserisci nella
 * pagina", a destra "Allega alla nota". Non riceve il mouse (il trascinamento è un evento di
 * Tauri): la zona sotto il puntatore la calcola l'editor con le misure di questo pannello.
 */
const DropOverlay = forwardRef<HTMLDivElement, { zone: DropZone | null; count: number }>(function DropOverlay({ zone, count }, ref) {
  const many = count > 1;
  return (
    <div ref={ref} className="nq-drop" aria-live="polite">
      <div className={`nq-dz${zone === "insert" ? " is-hot" : ""}`} data-zone="insert">
        <MdOutlineImage aria-hidden="true" />
        <b>Inserisci nella pagina</b>
        <p>Rilascia dove vuoi che {many ? "compaiano" : "compaia"}. Le immagini restano modificabili.</p>
      </div>
      <div className={`nq-dz${zone === "attach" ? " is-hot" : ""}`} data-zone="attach">
        <MdOutlineAttachFile aria-hidden="true" />
        <b>Allega alla nota</b>
        <p>{many ? "I file vanno" : "Il file va"} nella cartella della nota e {many ? "compaiono" : "compare"} negli allegati.</p>
      </div>
    </div>
  );
});

export default DropOverlay;
