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
