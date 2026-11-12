import { useEffect, useRef, type MouseEvent } from "react";
import { useLatestRef } from "./useLatestRef";

/**
 * Oltre questo intervallo due click non sono più un doppio click. Windows e macOS di serie ne ammettono circa 500
 * (col trackpad del Mac i doppi tocchi sono lenti): con 250 il primo click partiva prima del secondo.
 */
const DOUBLE_CLICK_MS = 450;

/**
 * Click singolo che non scatta se l'utente sta facendo un doppio click.
 * Serve ai pulsanti che occupano tutta la cella (1×1): il doppio click
 * apre il dettaglio e non deve, per esempio, mettere in pausa e riprendere.
 * Da tastiera (Invio, spazio) l'azione parte subito.
 */
export function useSingleClick(action: () => void) {
  const timerRef = useRef<number | null>(null);
  const actionRef = useLatestRef(action);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  return (e: MouseEvent) => {
    e.stopPropagation();
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (e.detail === 0) {
      actionRef.current();
      return;
    }
    if (e.detail > 1) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      actionRef.current();
    }, DOUBLE_CLICK_MS);
  };
}
