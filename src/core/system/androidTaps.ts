/**
 * Tocco su una notifica dell'app su Android: MainActivity.kt (src-tauri/gen/android) legge l'id della notifica
 * dall'intent e lo passa alla pagina, a app aperta con l'evento `pd-notification-tap`, all'avvio a freddo con
 * `window.__pdLaunch.takeNotificationId()`. Il plugin delle notifiche da solo dice solo "tap", senza quale notifica,
 * e a freddo l'evento arriva prima che la pagina ascolti. Sul desktop non arriva mai nulla.
 */

declare global {
  interface Window {
    /** Ponte di MainActivity.kt: l'id della notifica che ha avviato l'app, una volta sola (-1 se nessuna). */
    __pdLaunch?: { takeNotificationId(): number };
  }
}

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Chiama `listener` con l'id della notifica toccata: subito se è quella che ha avviato l'app, poi a ogni tocco.
 * Restituisce la funzione per smettere.
 */
export function onNotificationTap(listener: (id: number) => void): () => void {
  const handler = (event: Event) => {
    const id = ((event as CustomEvent<unknown>).detail as { id?: unknown } | null)?.id;
    if (validId(id)) listener(id);
  };
  window.addEventListener("pd-notification-tap", handler);
  try {
    const launched = window.__pdLaunch?.takeNotificationId();
    if (validId(launched)) listener(launched);
  } catch (error) {
    console.error("Notifica di avvio non letta:", error);
  }
  return () => window.removeEventListener("pd-notification-tap", handler);
}
