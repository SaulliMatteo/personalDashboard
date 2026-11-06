import { useEffect } from "react";

/** Quanto tenere premuto col dito prima che il widget si stacchi (come sul telefono, MobileDashboard). */
const LONG_PRESS_MS = 500;
/** Oltre questo movimento prima della pressione lunga il tocco non è più un trascinamento. */
const TOUCH_SLOP = 10;

/**
 * Griglia desktop su un tablet (solo dito): react-grid-layout trascina dal primo tocco e la libreria che usa
 * (react-draggable) annulla ogni touchstart sulle celle, quindi il browser non genera né click né doppio tocco e i
 * pulsanti dei widget non rispondono. Qui il touchstart vero si ferma prima della libreria; dopo una pressione lunga
 * le si passa un touchstart con lo stesso identificativo del dito, così il trascinamento continua con il dito vero.
 */
export function useLongPressGridDrag(grid: HTMLElement | null, enabled: boolean) {
  useEffect(() => {
    if (!grid || !enabled) return;
    let timer: number | undefined;
    let start: { x: number; y: number } | null = null;
    let armed = false;
    // da trascinamento iniziato il dito non deve far scorrere né rimbalzare la pagina
    const blockScroll = (e: TouchEvent) => e.preventDefault();

    const reset = () => {
      window.clearTimeout(timer);
      start = null;
      armed = false;
      window.removeEventListener("touchmove", blockScroll);
    };

    const onStart = (e: TouchEvent) => {
      if (armed) return; // il touchstart passato da noi alla libreria
      e.stopPropagation();
      reset();
      const target = e.target;
      if (e.touches.length !== 1 || !(target instanceof Element) || !target.closest(".react-grid-item")) return;
      const t = e.changedTouches[0];
      start = { x: t.clientX, y: t.clientY };
      timer = window.setTimeout(() => {
        armed = true;
        window.addEventListener("touchmove", blockScroll, { passive: false });
        const touch = new Touch({
          identifier: t.identifier,
          target,
          clientX: t.clientX,
          clientY: t.clientY,
          pageX: t.pageX,
          pageY: t.pageY,
          screenX: t.screenX,
          screenY: t.screenY,
        });
        target.dispatchEvent(
          new TouchEvent("touchstart", {
            bubbles: true,
            cancelable: true,
            touches: [touch],
            targetTouches: [touch],
            changedTouches: [touch],
          })
        );
      }, LONG_PRESS_MS);
    };

    const onMove = (e: TouchEvent) => {
      if (!start || armed) return;
      const t = e.touches[0];
      if (t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > TOUCH_SLOP) reset();
    };

    // la libreria ascolta touchend sul documento (in bolla): si azzera dopo, su window
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) reset();
    };

    grid.addEventListener("touchstart", onStart, { capture: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      reset();
      grid.removeEventListener("touchstart", onStart, { capture: true });
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [grid, enabled]);
}
