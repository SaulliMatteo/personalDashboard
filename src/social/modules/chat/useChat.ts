import { createContext, useContext } from "react";
import type { ChannelState } from "../../presence/presenceHub";
import type { GroupChat } from "./chatStore";
import type { ReactionKind } from "./payload";

/* Contesto e hook separati dal provider (ChatProvider.tsx), come per le impostazioni. */

/** Perché un messaggio non è partito. */
export type ChatSendError = "empty" | "too_long" | "too_fast" | "offline" | "failed";

export interface ChatValue {
  /** gruppo → chat dal vivo (solo in memoria, da quando l'app è aperta). */
  chats: Record<string, GroupChat>;
  /** gruppo → stato del canale; assente = non si è dentro (account non pronto o modulo spento). */
  channels: Record<string, ChannelState>;
  /** ora del server ≈ ora locale + offsetMs */
  offsetMs: number;
  send: (groupId: string, text: string) => Promise<ChatSendError | null>;
  /** Elimina un proprio messaggio, per tutti quelli connessi. */
  remove: (groupId: string, messageId: string) => Promise<boolean>;
  react: (groupId: string, messageId: string, kind: ReactionKind, on: boolean) => Promise<boolean>;
  /** La chat di questo gruppo è sotto gli occhi (scheda Messaggi aperta): i non letti si azzerano. null = nessuna. */
  setViewing: (groupId: string | null) => void;
}

export const ChatContext = createContext<ChatValue | undefined>(undefined);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat deve essere usato dentro <ChatProvider>");
  return ctx;
}
