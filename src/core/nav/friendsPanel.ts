/*
 * Richieste di aprire il pannello degli amici da fuori (clic su una notifica, tocco su Android, link
 * personaldashboard://amici/<codice>). Il pannello sta in `social`, che `core` e `features` non importano: chi lo
 * gestisce (social/friends/FriendsProvider.tsx) si registra qui. Una richiesta arrivata prima che qualcuno ascolti
 * (tocco a freddo su Android) resta in attesa e la riceve il primo che si registra.
 * Il pulsante degli amici sta nella dashboard: NavProvider ascolta con `onFriendsPanelShow` e ci torna.
 */

export interface FriendsPanelRequest {
  /** Apri la chat con questo amico. */
  userId?: string;
  /** Apri "Aggiungi un amico" con questo codice già scritto. */
  code?: string;
  /** Apri "Aggiungi un amico" (le richieste ricevute stanno lì). */
  add?: boolean;
}

type Listener = (request: FriendsPanelRequest) => void;

let listener: Listener | null = null;
let pending: FriendsPanelRequest | null = null;
const showListeners = new Set<() => void>();

export function requestFriendsPanel(request: FriendsPanelRequest = {}): void {
  for (const show of showListeners) show();
  if (listener) listener(request);
  else pending = request;
}

/** Chi apre il pannello. Restituisce la funzione per smettere di ascoltare. */
export function onFriendsPanelRequest(fn: Listener): () => void {
  listener = fn;
  if (pending) {
    const request = pending;
    pending = null;
    fn(request);
  }
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Chiamato a ogni richiesta, prima di aprire il pannello (per tornare alla dashboard). */
export function onFriendsPanelShow(fn: () => void): () => void {
  showListeners.add(fn);
  return () => {
    showListeners.delete(fn);
  };
}
