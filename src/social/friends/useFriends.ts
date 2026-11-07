import { createContext, useContext } from "react";
import type { FriendRequestResult } from "../../core/cloud/friendsApi";
import type { FriendsPanelRequest } from "../../core/nav/friendsPanel";
import type { FriendsData } from "./friendsStore";

/* Contesto e hook separati dal provider (FriendsProvider.tsx). */

/**
 * - off: Gruppi non configurati, non connessi all'account o senza nome utente (lo dice useCloud);
 * - loading: prima lettura in corso;
 * - ready: dati letti (l'ultima lettura è riuscita);
 * - offline: l'ultima lettura non è riuscita: si vede ciò che c'era, non si scrive.
 */
export type FriendsStatus = "off" | "loading" | "ready" | "offline";

export interface FriendsPanelState {
  open: boolean;
  /** La chat aperta (id dell'amico). */
  chat: string | null;
  /** La finestrella "Aggiungi un amico". */
  add: boolean;
  /** Codice già scritto (dal link). */
  addCode: string;
}

export interface FriendsContextValue {
  status: FriendsStatus;
  /** Il mio id (null se non connesso). */
  me: string | null;
  data: FriendsData;
  /** Pallino sull'icona: non letti + richieste ricevute. */
  attention: number;
  panel: FriendsPanelState;
  openPanel: (request?: FriendsPanelRequest) => void;
  closePanel: () => void;
  openChat: (friendId: string | null) => void;
  closeAdd: () => void;
  /** Le azioni qui sotto lanciano un CloudError con un messaggio già in italiano. */
  sendText: (friendId: string, text: string) => Promise<void>;
  sendCard: (friendId: string, kind: string, body: string, payload: unknown) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  requestFriend: (code: string) => Promise<FriendRequestResult>;
  answerRequest: (userId: string, accept: boolean) => Promise<void>;
  cancelRequest: (userId: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  /** Il mio codice (null finché non è stato letto). */
  myCode: string | null;
  loadMyCode: () => Promise<void>;
  regenerateCode: () => Promise<void>;
  reload: () => void;
}

export const FriendsContext = createContext<FriendsContextValue | undefined>(undefined);

export function useFriends() {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error("useFriends deve essere usato dentro <FriendsProvider>");
  return ctx;
}
