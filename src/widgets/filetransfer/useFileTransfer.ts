import { createContext, useContext } from "react";
import type { FileEntry } from "./data/fileTransferApi";

/* Contesto e hook separati dal provider: così l'aggiornamento a caldo di Vite non crea
   un secondo contesto quando cambia il file del provider (o qualcosa che importa). */

export interface FileTransferContextValue {
  /** True quando lo stato iniziale (server + file) è stato letto. */
  ready: boolean;
  running: boolean;
  /** "ip:porta" da aprire sull'iPad; null se il server è fermo. */
  address: string | null;
  port: number;
  busy: boolean;
  error: string | null;
  /** File ricevuti, i più recenti per primi. */
  files: FileEntry[];
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  openFolder: () => Promise<void>;
  clearError: () => void;
}

export const FileTransferContext = createContext<FileTransferContextValue | undefined>(undefined);

export function useFileTransfer() {
  const ctx = useContext(FileTransferContext);
  if (!ctx) throw new Error("useFileTransfer deve essere usato dentro <FileTransferProvider>");
  return ctx;
}
