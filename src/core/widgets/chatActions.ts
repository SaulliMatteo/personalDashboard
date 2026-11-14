import { createElement, type ComponentType, type ReactNode } from "react";
import type { Pigment } from "../theme/themes";

/*
 * Azioni dei widget nella chat degli amici (docs/mockup/gruppi/amici-notifiche.html, viste 4-6 e 9): il "+" accanto al campo
 * le elenca, `Compose` sceglie cosa mandare e `Card` disegna la scheda inviata o ricevuta. Le dichiara il widget
 * (`chatActions` della sua WidgetDefinition), le raccoglie app/App.tsx e le passa agli amici (social non importa i
 * widget). Il server non guarda il `payload`: lo controlla `parse` di chi lo disegna, a ogni lettura.
 */

export interface ChatComposeProps {
  /** Nome utente dell'amico (per i testi: "Consiglia un video a …"). */
  friendName: string;
  /**
   * Manda la scheda: `payload` è l'oggetto che leggerà `parse`, `comment` la riga facoltativa che va sotto.
   * Restituisce l'id del messaggio; lancia un Error con il messaggio già in italiano.
   */
  send: (payload: Record<string, unknown>, comment: string) => Promise<string>;
  onClose: () => void;
}

export interface ChatCardProps<P> {
  payload: P;
  /** La scheda è mia (inviata) o dell'amico (ricevuta). */
  mine: boolean;
  /** Id del messaggio (per ricordare che una scheda è già stata salvata). */
  messageId: string;
  friendName: string;
  /** Chiude il pannello degli amici (prima di aprire una pagina). */
  closePanel: () => void;
  /** La Stanza comune di un gruppo in cui siamo tutti e due; null se non ce n'è. */
  openRoom: (() => void) | null;
}

export interface ChatActionSpec<P> {
  /** Il `kind` del messaggio: `^[a-z][a-z0-9_]{0,19}$` (controllo del server). Mai cambiarlo dopo il rilascio. */
  kind: string;
  /** Voce del menu "+", es. "Consiglia un video". */
  label: string;
  /** Riga sotto la voce, es. "Dai tuoi video o da un link". */
  hint: string;
  /** Titolo della finestra di scelta. */
  composeTitle: (friendName: string) => string;
  icon: ComponentType;
  /** Il payload ricevuto, validato e ripulito; null se non è valido (si mostra la scheda di ripiego). */
  parse: (payload: unknown) => P | null;
  /** Una riga per l'anteprima nell'elenco e per la notifica, es. "🎬 Integrali per parti". */
  describe: (payload: P) => string;
  Compose: ComponentType<ChatComposeProps>;
  Card: ComponentType<ChatCardProps<P>>;
}

/** Un'azione con il tipo del payload cancellato: è ciò che gira fuori dal widget. */
export interface ChatAction {
  kind: string;
  label: string;
  hint: string;
  composeTitle: (friendName: string) => string;
  icon: ComponentType;
  Compose: ComponentType<ChatComposeProps>;
  /** null se il payload non è valido. */
  describe: (payload: unknown) => string | null;
  /** La scheda, o null se il payload non è valido. */
  renderCard: (props: Omit<ChatCardProps<unknown>, "payload"> & { payload: unknown }) => ReactNode | null;
}

/** Con il pigmento del widget (in Opaco la scheda prende i suoi colori). */
export interface PlacedChatAction extends ChatAction {
  pigment: Pigment;
}

export function defineChatAction<P>(spec: ChatActionSpec<P>): ChatAction {
  // la stessa scheda si disegna a ogni render (e la nota ripulisce l'HTML): si legge una volta per payload
  const cache = new WeakMap<object, P | null>();
  const parse = (payload: unknown): P | null => {
    if (typeof payload !== "object" || payload === null) return spec.parse(payload);
    if (!cache.has(payload)) cache.set(payload, spec.parse(payload));
    return cache.get(payload) ?? null;
  };
  return {
    kind: spec.kind,
    label: spec.label,
    hint: spec.hint,
    composeTitle: spec.composeTitle,
    icon: spec.icon,
    Compose: spec.Compose,
    describe: (payload) => {
      const parsed = parse(payload);
      return parsed === null ? null : spec.describe(parsed);
    },
    renderCard: ({ payload, ...rest }) => {
      const parsed = parse(payload);
      return parsed === null ? null : createElement(spec.Card, { ...rest, payload: parsed });
    },
  };
}
