import { isAndroid } from "./platform";

/**
 * Uscite dall'app su Android: al rientro MainActivity.kt (src-tauri/gen/android) manda l'evento `pd-away` con quando
 * si è usciti, quando si è tornati e per quanto il telefono è stato usato nel frattempo (schermo acceso e sbloccato
 * fuori dall'app). Lo usa lo stop automatico dello Studio. Sul desktop non arriva mai.
 */
export interface AwayReport {
  /** Istante (ms) in cui l'app è uscita dal primo piano. */
  leftAt: number;
  /** Istante (ms) del rientro. */
  backAt: number;
  /** Millisecondi passati a usare il telefono in altre app (lo schermo spento non conta). */
  usedMs: number;
}

/** true dove al rientro arriva `pd-away` (Android): chi deve aspettarlo prima di fare altro lo sa da qui. */
export function reportsAppReturn(): boolean {
  return isAndroid();
}

function valid(value: unknown): value is AwayReport {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return ["leftAt", "backAt", "usedMs"].every((k) => typeof v[k] === "number" && Number.isFinite(v[k]) && (v[k] as number) >= 0);
}

/** Chiama `listener` a ogni rientro nell'app; restituisce la funzione per smettere. */
export function onAppReturn(listener: (report: AwayReport) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (valid(detail) && detail.backAt >= detail.leftAt) listener(detail);
  };
  window.addEventListener("pd-away", handler);
  return () => window.removeEventListener("pd-away", handler);
}
