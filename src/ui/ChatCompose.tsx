import { useState, type ReactNode } from "react";
import { MdSearch, MdSend } from "react-icons/md";
import "./ChatCompose.css";

/*
 * Pezzi della finestra in cui un widget sceglie cosa mandare a un amico (docs/mockup/gruppi/amici-notifiche.html, vista 5):
 * schede in alto, ricerca, righe da scegliere e il fondo con il messaggio facoltativo, Annulla e Invia.
 * La finestra (titolo, Esc, foglio dal basso sul telefono) la mette il pannello degli amici.
 */

/** Lunghezza massima del messaggio sotto la scheda (come il testo dei messaggi). */
export const CHAT_COMMENT_MAX = 500;

export function ChatComposeTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="chc-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={value === t.id ? "is-on" : undefined} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ChatComposeSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="chc-search">
      <MdSearch aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

/** Elenco che scorre (le righe sono ChatComposeRow). */
export function ChatComposeList({ children, empty }: { children: ReactNode; empty: string | null }) {
  return <div className="chc-list">{empty ? <p className="chc-empty">{empty}</p> : children}</div>;
}

interface ChatComposeRowProps {
  selected: boolean;
  onSelect: () => void;
  /** Miniatura o pallino a sinistra. */
  lead?: ReactNode;
  title: string;
  sub?: string;
}

export function ChatComposeRow({ selected, onSelect, lead, title, sub }: ChatComposeRowProps) {
  return (
    <button type="button" className={`chc-row${selected ? " is-on" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <span className={`chc-radio${selected ? " is-on" : ""}`} aria-hidden="true" />
      {lead}
      <span className="chc-row-text">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
    </button>
  );
}

/** Un campo con l'etichetta sopra (es. "Materia", "Ora"). */
export function ChatComposeField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="chc-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

interface ChatComposeFootProps {
  /** null = niente da mandare ancora (Invia spento). */
  payload: Record<string, unknown> | null;
  send: (payload: Record<string, unknown>, comment: string) => Promise<string>;
  onClose: () => void;
  /** Dopo l'invio riuscito, con l'id del messaggio (es. per ricordare la nota mandata). */
  onSent?: (messageId: string) => void | Promise<void>;
  /** Errore della preparazione (es. "Nota troppo grande"), mostrato sopra il fondo. */
  error?: string | null;
  /** Il payload si sta ancora preparando (es. lettura del link). */
  busy?: boolean;
}

/** Messaggio facoltativo + Annulla + Invia, con l'errore dell'invio. */
export function ChatComposeFoot({ payload, send, onClose, onSent, error = null, busy = false }: ChatComposeFootProps) {
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const shown = error ?? sendError;

  async function submit() {
    if (!payload || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const id = await send(payload, comment);
      await onSent?.(id);
      onClose();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
      setSending(false);
    }
  }

  return (
    <form
      className="chc-foot"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {shown && (
        <p className="chc-error" role="alert">
          {shown}
        </p>
      )}
      <input
        type="text"
        className="chc-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={CHAT_COMMENT_MAX}
        placeholder="Aggiungi un messaggio (facoltativo)"
        aria-label="Messaggio (facoltativo)"
        enterKeyHint="send"
      />
      <div className="chc-foot-btns">
        <button type="button" className="chc-btn" onClick={onClose}>
          Annulla
        </button>
        <button type="submit" className="chc-btn chc-btn--primary" disabled={!payload || sending || busy}>
          <MdSend aria-hidden="true" /> {sending ? "Invio…" : "Invia"}
        </button>
      </div>
    </form>
  );
}
