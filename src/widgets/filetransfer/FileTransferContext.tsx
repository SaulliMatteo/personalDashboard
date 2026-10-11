import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FT_PORT,
  getServerInfo,
  listFiles,
  openReceivedFolder,
  startServer as startServerApi,
  stopServer as stopServerApi,
  type FileEntry,
} from "./data/fileTransferApi";

interface FileTransferContextValue {
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

const FileTransferContext = createContext<FileTransferContextValue | undefined>(undefined);

const POLL_MS = 2000;

/**
 * Stato condiviso tra widget e pagina di dettaglio. Il server vive nel
 * backend Rust: questo provider lo rispecchia, quindi tornare alla
 * dashboard non lo ferma. Mentre il server è acceso, la lista dei file si
 * aggiorna da sola.
 */
export function FileTransferProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);

  const refreshFiles = useCallback(async () => {
    try {
      setFiles(await listFiles());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [info, list] = await Promise.all([getServerInfo(), listFiles()]);
        if (cancelled) return;
        setRunning(info.running);
        setAddress(info.address);
        setFiles(list);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(refreshFiles, POLL_MS);
    return () => clearInterval(interval);
  }, [running, refreshFiles]);

  const startServer = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await startServerApi();
      setAddress(result);
      setRunning(true);
      await refreshFiles();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [refreshFiles]);

  const stopServer = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await stopServerApi();
      setRunning(false);
      setAddress(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const openFolder = useCallback(async () => {
    try {
      await openReceivedFolder();
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      ready, running, address, port: FT_PORT, busy, error, files,
      startServer, stopServer, refreshFiles, openFolder, clearError,
    }),
    [ready, running, address, busy, error, files, startServer, stopServer, refreshFiles, openFolder, clearError]
  );

  return <FileTransferContext.Provider value={value}>{children}</FileTransferContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFileTransfer() {
  const ctx = useContext(FileTransferContext);
  if (!ctx) throw new Error("useFileTransfer deve essere usato dentro <FileTransferProvider>");
  return ctx;
}
