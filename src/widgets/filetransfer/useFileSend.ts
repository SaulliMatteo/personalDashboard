import { createContext, useContext } from "react";

/** Un file in invio o inviato, nell'elenco "Trasferimenti" (solo in memoria). */
export interface Transfer {
  id: number;
  name: string;
  status: "waiting" | "sending" | "done" | "error";
  sent: number;
  /** 0 finché il file non è aperto. */
  total: number;
  /** Nome con cui il PC l'ha salvato (può aggiungere " (1)"), o il motivo dell'errore. */
  message: string | null;
}

export interface FileSendContextValue {
  ready: boolean;
  /** Indirizzo del PC ricordato ("ip:porta"); vuoto se non è mai stato scritto. */
  address: string;
  /** null = non controllato (o in controllo), poi raggiungibile o no. */
  reachable: boolean | null;
  checking: boolean;
  /** Errore sull'indirizzo (non valido) o sul selettore. */
  error: string | null;
  transfers: Transfer[];
  /** Un invio in corso: i nuovi file si mettono in coda. */
  sending: boolean;
  /** Salva l'indirizzo e controlla subito se il PC risponde. */
  connect: (address: string) => Promise<void>;
  check: () => Promise<void>;
  /** Selettore di sistema e invio dei file scelti, uno dopo l'altro. */
  pickAndSend: () => Promise<void>;
  clearDone: () => void;
  clearError: () => void;
}

export const FileSendContext = createContext<FileSendContextValue | undefined>(undefined);

export function useFileSend() {
  const ctx = useContext(FileSendContext);
  if (!ctx) throw new Error("useFileSend deve essere usato dentro <FileSendProvider>");
  return ctx;
}
