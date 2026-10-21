import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { emitActivityEvent } from "../../core/activity/activityBus";
import {
  FT_PORT,
  getServerInfo,
  listFiles,
  openReceivedFolder,
  startServer as startServerApi,
  stopServer as stopServerApi,
  type FileEntry,
} from "./data/fileTransferApi";
import { FileTransferContext } from "./useFileTransfer";

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

  // True dopo il primo elenco letto CON SUCCESSO: solo da lì si contano i file "nuovi".
  const listedOnceRef = useRef(false);

  const refreshFiles = useCallback(async () => {
    try {
      const list = await listFiles();
      listedOnceRef.current = true;
      setFiles(list);
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
        listedOnceRef.current = true;
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

  // File nuovi arrivati dal telefono: evento per chi ascolta (es. il Companion).
  // Il primo elenco caricato fa solo da riferimento.
  const knownNamesRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ready || !listedOnceRef.current) return;
    const names = new Set(files.map((f) => f.name));
    const known = knownNamesRef.current;
    knownNamesRef.current = names;
    if (known === null) return;
    const added = [...names].filter((n) => !known.has(n)).length;
    if (added > 0) emitActivityEvent({ type: "fileReceived", count: added });
  }, [ready, files]);

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
      // La porta reale può essere diversa da FT_PORT se quella era occupata.
      ready, running, address, port: address ? Number(address.split(":").pop()) : FT_PORT, busy, error, files,
      startServer, stopServer, refreshFiles, openFolder, clearError,
    }),
    [ready, running, address, busy, error, files, startServer, stopServer, refreshFiles, openFolder, clearError]
  );

  return <FileTransferContext.Provider value={value}>{children}</FileTransferContext.Provider>;
}
