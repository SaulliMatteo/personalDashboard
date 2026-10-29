/*
 * Gli eventi della chat dal vivo (versione 1) e la loro validazione. Puro: l'ora del server arriva da fuori (lo prova
 * scripts/gruppi/chat.test.mts). Nessun evento viene salvato: chi non è connesso non lo riceve.
 *
 * - msg: un messaggio di testo;
 * - del: l'autore elimina un suo messaggio;
 * - react: Mi piace / Fuoco su un messaggio, accesa o spenta (idempotente);
 * - sys: un messaggio di sistema che l'app di qualcuno manda per sé ("è entrato nel gruppo", "ha studiato 3 ore").
 * `from` è l'utente che dice di mandarlo: Realtime non lo garantisce (vedi docs/GRUPPI.md, limiti), chi riceve
 * accetta solo membri del gruppo. Istanti in ms dell'orologio del SERVER.
 */

export const CHAT_VERSION = 1;
/** Lunghezza massima di un messaggio (come il contatore "0 / 500" del mockup). */
export const MESSAGE_MAX = 500;
/** Ore di studio di un messaggio di sistema "ha studiato N ore". */
export const STUDIED_HOURS_MAX = 24;

const DAY_MS = 86_400_000;

export type ReactionKind = "up" | "fire";
export const REACTION_KINDS: readonly ReactionKind[] = ["up", "fire"];

interface EventBase {
  v: 1;
  /** id dell'evento; per del e react, quello del messaggio a cui si riferisce */
  id: string;
  from: string;
  at: number;
}

export type ChatEvent =
  | (EventBase & { t: "msg"; text: string })
  | (EventBase & { t: "del" })
  | (EventBase & { t: "react"; kind: ReactionKind; on: boolean })
  | (EventBase & { t: "sys"; sys: "joined" })
  | (EventBase & { t: "sys"; sys: "studied"; hours: number });

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const USER_RE = /^[0-9a-fA-F-]{8,64}$/;

/** Caratteri di controllo e di direzione del testo (un nome o un messaggio non deve poter "girare" la riga). */
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F‎‏‪-‮⁦-⁩]/g;

/** Il testo come si manda e come si mostra: senza caratteri di controllo, a capo ridotti, spazi tolti ai lati. */
export function cleanMessageText(raw: string): string {
  return raw.replace(UNSAFE_CHARS, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Un evento ricevuto, controllato campo per campo; null se non è valido. I campi in più si tolgono. */
export function parseChatEvent(raw: unknown, serverNow: number): ChatEvent | null {
  if (!isRecord(raw) || raw.v !== CHAT_VERSION) return null;
  const { id, from, at } = raw;
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  if (typeof from !== "string" || !USER_RE.test(from)) return null;
  if (typeof at !== "number" || !Number.isFinite(at) || Math.abs(at - serverNow) > DAY_MS) return null;
  const base: EventBase = { v: 1, id, from, at };
  switch (raw.t) {
    case "msg": {
      if (typeof raw.text !== "string" || raw.text.length > MESSAGE_MAX * 2) return null;
      const text = cleanMessageText(raw.text);
      if (!text || text.length > MESSAGE_MAX) return null;
      return { ...base, t: "msg", text };
    }
    case "del":
      return { ...base, t: "del" };
    case "react":
      if (raw.kind !== "up" && raw.kind !== "fire") return null;
      if (typeof raw.on !== "boolean") return null;
      return { ...base, t: "react", kind: raw.kind, on: raw.on };
    case "sys":
      if (raw.sys === "joined") return { ...base, t: "sys", sys: "joined" };
      if (raw.sys === "studied" && typeof raw.hours === "number" && Number.isInteger(raw.hours) && raw.hours >= 1 && raw.hours <= STUDIED_HOURS_MAX) {
        return { ...base, t: "sys", sys: "studied", hours: raw.hours };
      }
      return null;
    default:
      return null;
  }
}

/** Un id casuale per un evento nuovo (random iniettato per i test). */
export function newEventId(random: () => number = Math.random): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) id += chars[Math.floor(random() * chars.length)];
  return id;
}
