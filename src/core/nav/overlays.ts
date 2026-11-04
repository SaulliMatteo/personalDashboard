import { useEffect, useState } from "react";

/**
 * Indietro di Android con qualcosa aperto sopra la pagina: lo schermo intero (es. il player di YouTube) o un dialogo
 * o menu (`role="dialog"`, `aria-modal`, `role="menu"`). Invece di cambiare vista si chiude quello: i dialoghi
 * dell'app si chiudono già con Esc, quindi qui si manda Esc al dialogo in cima, senza toccare ogni componente.
 * Un dialogo nuovo deve chiudersi con Esc (sul suo elemento o su window) e avere uno di quei ruoli.
 */
const OVERLAY = '[role="dialog"], [aria-modal="true"], [role="menu"]';

function topOverlay(): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(OVERLAY)].filter((el) => el.getClientRects().length > 0);
  return all[all.length - 1] ?? null;
}

/** C'è qualcosa da chiudere prima di cambiare vista? */
function overlayOpen(): boolean {
  return document.fullscreenElement !== null || topOverlay() !== null;
}

/**
 * Chiude quello che sta in cima. `fallback` parte se non c'era niente o se il dialogo non si è chiuso con Esc
 * (così l'indietro non resta mai bloccato).
 */
export function closeTopOverlay(fallback: () => void): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(fallback);
    return;
  }
  const top = topOverlay();
  if (!top) {
    fallback();
    return;
  }
  const active = document.activeElement;
  const target = active instanceof HTMLElement && top.contains(active) ? active : top;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  window.setTimeout(() => {
    if (top.isConnected && top.getClientRects().length > 0) fallback();
  }, 120);
}

/** Vero finché c'è un dialogo, un menu o lo schermo intero (solo se `enabled`: osserva il DOM). */
export function useOverlayOpen(enabled: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    // al massimo un controllo per fotogramma: il DOM cambia spesso (timer, animazioni)
    let frame = 0;
    const check = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setOpen(overlayOpen());
      });
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-modal", "hidden"] });
    document.addEventListener("fullscreenchange", check);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("fullscreenchange", check);
    };
  }, [enabled]);
  return enabled && open;
}
