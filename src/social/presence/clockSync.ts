import { retryDelayMs } from "../../core/cloud/backoff";
import { measureClockOffset } from "../../core/cloud/clock";

/** Ogni quanto si rimisura lo scarto dell'orologio. */
const CLOCK_REFRESH_MS = 10 * 60_000;

/**
 * Misura lo scarto tra l'orologio locale e quello del server: subito, poi ogni 10 minuti (con attese crescenti se
 * non risponde). Restituisce la funzione che la ferma.
 */
export function startClockSync(onOffset: (offsetMs: number) => void): () => void {
  let stopped = false;
  let timer: number | undefined;
  let failures = 0;
  const measure = () => {
    measureClockOffset()
      .then((offset) => {
        if (stopped) return;
        failures = 0;
        onOffset(offset);
        timer = window.setTimeout(measure, CLOCK_REFRESH_MS);
      })
      .catch(() => {
        if (!stopped) timer = window.setTimeout(measure, retryDelayMs(failures++));
      });
  };
  measure();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
