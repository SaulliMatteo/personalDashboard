import type { ChatEvent, ReactionKind } from "./payload";

/*
 * La chat di un gruppo, solo in memoria: gli eventi ricevuti (o mandati) diventano l'elenco dei messaggi. Puro e
 * immutabile (lo prova scripts/gruppi/chat.test.mts): un evento da ignorare restituisce lo stesso oggetto.
 */

/** Messaggi tenuti per gruppo: i più vecchi escono. */
export const CHAT_MAX_MESSAGES = 200;
/** Distanza minima tra due messaggi mandati da qui. */
export const SEND_INTERVAL_MS = 1000;

export interface ChatMessage {
  id: string;
  author: string;
  /** ms, ora del server */
  at: number;
  kind: "msg" | "joined" | "studied";
  /** "" se eliminato o di sistema */
  text: string;
  hours: number;
  deleted: boolean;
  /** chi ha messo la reazione, nell'ordine */
  reactions: Record<ReactionKind, string[]>;
}

export interface GroupChat {
  messages: ChatMessage[];
  /** Messaggi degli altri arrivati mentre non li si guardava. */
  unread: number;
}

export const EMPTY_CHAT: GroupChat = { messages: [], unread: 0 };

export interface ApplyOptions {
  /** È un membro del gruppo? Chi non lo è viene ignorato. */
  isMember: (userId: string) => boolean;
  me: string;
  /** La chat non è sotto gli occhi: un messaggio degli altri conta come non letto. */
  countUnread: boolean;
}

function update(chat: GroupChat, id: string, fn: (m: ChatMessage) => ChatMessage | null): GroupChat {
  const index = chat.messages.findIndex((m) => m.id === id);
  if (index < 0) return chat;
  const next = fn(chat.messages[index]);
  if (!next) return chat;
  const messages = chat.messages.slice();
  messages[index] = next;
  return { ...chat, messages };
}

function append(chat: GroupChat, message: ChatMessage, unread: boolean): GroupChat {
  if (chat.messages.some((m) => m.id === message.id)) return chat;
  const messages = chat.messages.concat(message);
  return {
    messages: messages.length > CHAT_MAX_MESSAGES ? messages.slice(messages.length - CHAT_MAX_MESSAGES) : messages,
    unread: chat.unread + (unread ? 1 : 0),
  };
}

/** La chat dopo un evento (validato con parseChatEvent). */
export function applyChatEvent(chat: GroupChat, event: ChatEvent, options: ApplyOptions): GroupChat {
  if (!options.isMember(event.from)) return chat;
  const base = { id: event.id, author: event.from, at: event.at, text: "", hours: 0, deleted: false, reactions: { up: [], fire: [] } };
  switch (event.t) {
    case "msg":
      return append(chat, { ...base, kind: "msg", text: event.text }, options.countUnread && event.from !== options.me);
    case "sys":
      return append(chat, event.sys === "joined" ? { ...base, kind: "joined" } : { ...base, kind: "studied", hours: event.hours }, false);
    case "del":
      // solo l'autore elimina il suo messaggio
      return update(chat, event.id, (m) =>
        m.kind === "msg" && !m.deleted && m.author === event.from ? { ...m, text: "", deleted: true, reactions: { up: [], fire: [] } } : null
      );
    case "react":
      return update(chat, event.id, (m) => {
        if (m.kind !== "msg" || m.deleted) return null;
        const who = m.reactions[event.kind];
        const has = who.includes(event.from);
        if (has === event.on) return null;
        const list = event.on ? who.concat(event.from) : who.filter((u) => u !== event.from);
        return { ...m, reactions: { ...m.reactions, [event.kind]: list } };
      });
  }
}

/** Si può mandare adesso? (un messaggio al secondo) */
export function canSendAt(lastSentAt: number | null, now: number): boolean {
  return lastSentAt === null || now - lastSentAt >= SEND_INTERVAL_MS;
}

/** Il messaggio continua quello prima (stesso autore, nessuno dei due eliminato): niente nome, angolo arrotondato. */
export function continuesPrevious(messages: readonly ChatMessage[], index: number): boolean {
  const prev = messages[index - 1];
  const m = messages[index];
  return !!prev && prev.kind === "msg" && m.kind === "msg" && prev.author === m.author && !prev.deleted && !m.deleted;
}
