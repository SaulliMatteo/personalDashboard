import { authorizeRealtime } from "../../core/cloud/presence";

/**
 * Apre e chiude i canali di un hub per l'elenco di gruppi (`groupKey` = id separati da virgole): prima passa a
 * Realtime il token della sessione, perché le policy dei canali lo leggono.
 */
export function openChannels(hub: { setGroups: (groupIds: string[]) => void }, groupKey: string): void {
  const ids = groupKey ? groupKey.split(",") : [];
  authorizeRealtime()
    .catch(() => {})
    // se nel frattempo il hub è stato fermato (uscita, cambio di account) setGroups non fa nulla
    .then(() => hub.setGroups(ids));
}

/**
 * Al ritorno in primo piano (pagina di nuovo visibile) i canali caduti del hub riprovano subito, con il token della
 * sessione appena riletto (scaduto mentre l'app era ferma: getSession lo rinnova). I limiti della presenza li tiene il
 * hub. La connessione Realtime sotto si riallaccia da sola (heartbeat di realtime-js). Restituisce la funzione per
 * smettere.
 */
export function retryOnReturn(hub: { retryNow: () => void }): () => void {
  const onVisibility = () => {
    if (document.hidden) return;
    authorizeRealtime()
      .catch(() => {})
      .then(() => hub.retryNow());
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => document.removeEventListener("visibilitychange", onVisibility);
}
