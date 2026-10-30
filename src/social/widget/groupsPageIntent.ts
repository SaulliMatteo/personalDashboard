/*
 * Come aprire la pagina Gruppi su "Cosa vedono gli altri" da fuori (es. il link nella scheda Da fare della Stanza
 * comune): la navigazione apre solo il dettaglio del widget, quindi la richiesta resta qui finché la pagina la legge.
 */

let openSharing = false;

export function requestGroupsSharing(): void {
  openSharing = true;
}

/** La pagina la legge all'apertura (anche due volte in StrictMode) e la toglie dopo, con clearGroupsSharingRequest. */
export function wantsGroupsSharing(): boolean {
  return openSharing;
}

export function clearGroupsSharingRequest(): void {
  openSharing = false;
}
