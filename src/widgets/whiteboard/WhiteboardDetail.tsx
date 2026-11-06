import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useNav } from "../../core/nav/useNav";
import { useBackHandler } from "../../core/nav/backHandlers";
import { useThemeVariant, type ThemeVariants } from "../../core/theme/variants";
import BackButton from "../../ui/BackButton";
import ConfirmButton from "../../ui/ConfirmButton";
import UnsavedNotice from "./components/UnsavedNotice";
import { isWindowFullscreen, onWindowResized, setWindowFullscreen } from "./data/windowApi";
import "./WhiteboardDetail.css";

// Excalidraw è pesante: si scarica solo quando si apre questa pagina.
const Board = lazy(() => import("./components/Board"));

/** Dove sta l'avviso: sopra la cornice (Notte, Quaderno) o dentro (Opaco sul passe-partout, Fosforo nella barra del modulo). */
const NOTICE_PLACE: ThemeVariants<"above" | "inside"> = {
  notte: "above",
  opaco: "inside",
  quaderno: "above",
  fosforo: "inside",
};

/**
 * Pagina della Lavagna: intestazione, avviso "non viene salvata" e la lavagna
 * che riempie il resto della finestra (la pagina non scrolla). Il disegno vive
 * solo qui: lasciando la pagina si perde. A schermo intero la cornice copre
 * tutta la finestra (solo una classe CSS: Excalidraw non si smonta e il disegno resta).
 */
function WhiteboardDetail() {
  const { goToDashboard } = useNav();
  const [hasDrawing, setHasDrawing] = useState(false);
  const noticePlace = useThemeVariant(NOTICE_PLACE);
  const [fullscreen, setFullscreen] = useState(false);
  // Indietro (Android, o ← sul telefono) con un disegno: il primo avvisa, il secondo entro 3 s esce e lo cancella,
  // come "Esci e cancella" qui sotto (che sul telefono è nascosto).
  const [backArmed, setBackArmed] = useState(false);
  useBackHandler(hasDrawing, () => (backArmed ? goToDashboard() : setBackArmed(true)));
  useEffect(() => {
    if (!backArmed) return;
    const t = window.setTimeout(() => setBackArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [backArmed]);
  // true solo se la finestra è davvero andata a schermo intero (altrove, es. Linux, resta la lavagna a tutta finestra).
  const windowFullscreenRef = useRef(false);

  const toggleFullscreen = useCallback(() => {
    const next = !fullscreen;
    setFullscreen(next);
    setWindowFullscreen(next)
      .then(() => {
        windowFullscreenRef.current = next;
      })
      .catch(() => {
        windowFullscreenRef.current = false;
      });
  }, [fullscreen]);

  useEffect(() => {
    // Uscita dallo schermo intero senza il pulsante (es. macOS): la pagina si riallinea.
    let alive = true;
    let unlisten: (() => void) | undefined;
    onWindowResized(() => {
      if (!windowFullscreenRef.current) return;
      void isWindowFullscreen().then((isFull) => {
        if (isFull || !windowFullscreenRef.current) return;
        windowFullscreenRef.current = false;
        setFullscreen(false);
      });
    })
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch(() => {});

    return () => {
      alive = false;
      unlisten?.();
      // Lasciando la pagina la finestra torna normale.
      if (windowFullscreenRef.current) {
        windowFullscreenRef.current = false;
        void setWindowFullscreen(false).catch(() => {});
      }
    };
  }, []);

  return (
    <div className={`wb-detail${fullscreen ? " wb-detail--full" : ""}`}>
      <header className="dashboard-header wb-detail-header">
        <div>
          <h1>Lavagna</h1>
          <p>Schemi e disegni veloci.</p>
        </div>
        {hasDrawing ? (
          <ConfirmButton
            className="detail-back-btn wb-exit"
            label="Esci e cancella"
            confirmLabel="Sicuro? Il disegno si perde"
            onConfirm={goToDashboard}
          />
        ) : (
          <BackButton onClick={goToDashboard} />
        )}
      </header>

      {noticePlace === "above" && <UnsavedNotice />}
      {backArmed && hasDrawing && (
        <p className="wb-back-hint" role="status">
          Premi di nuovo indietro per uscire: il disegno si perde.
        </p>
      )}

      <div className="wb-frame">
        {noticePlace === "inside" && <UnsavedNotice />}
        <div className="wb-board">
          <Suspense fallback={<p className="wb-loading">Caricamento lavagna…</p>}>
            <Board onHasDrawingChange={setHasDrawing} fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default WhiteboardDetail;
