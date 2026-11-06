import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import { checkTarget, loadSendAddress, pickFiles, saveSendAddress, sendFile, type PickedFile } from "./data/fileSendApi";
import { FT_PORT, type FileEntry } from "./data/fileTransferApi";
import { FileSendContext, type Transfer } from "./useFileSend";
import { FileTransferContext, type FileTransferContextValue } from "./useFileTransfer";

/** Ogni quanto ricontrollare se il PC risponde (solo con l'app in vista e nessun invio in corso). */
const CHECK_MS = 20_000;

/**
 * File Transfer su Android: il telefono invia al server del PC, come la pagina web dell'iPad.
 * L'indirizzo del PC si scrive una volta e resta nei metadati; i trasferimenti partono uno alla volta e restano
 * in elenco solo finché l'app è aperta. Alla dashboard (card, mini) passa lo stesso contesto del desktop
 * (FileTransferContext), letto come "PC raggiungibile" e "file inviati".
 */
export function FileSendProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [address, setAddress] = useState("");
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [sending, setSending] = useState(false);

  const addressRef = useLatestRef(address);
  const sendingRef = useLatestRef(sending);
  const queueRef = useRef<{ id: number; file: PickedFile }[]>([]);
  const nextIdRef = useRef(1);
  const runningRef = useRef(false);

  /** Falso se l'indirizzo non è valido (errore mostrato), vero se è stato controllato. */
  const runCheck = useCallback(async (target: string): Promise<boolean> => {
    if (!target) return false;
    setChecking(true);
    try {
      setReachable(await checkTarget(target));
      setError(null);
      return true;
    } catch (e) {
      setReachable(false);
      setError(String(e));
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSendAddress()
      .then((saved) => {
        if (cancelled || !saved) return;
        setAddress(saved);
        void runCheck(saved);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [runCheck]);

  // il PC può spegnersi o cambiare rete: si ricontrolla ogni tanto e al rientro nell'app
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible" && !sendingRef.current) void runCheck(addressRef.current);
    };
    const interval = window.setInterval(tick, CHECK_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [runCheck, addressRef, sendingRef]);

  const connect = useCallback(
    async (value: string) => {
      const target = value.trim().includes(":") || !value.trim() ? value.trim() : `${value.trim()}:${FT_PORT}`;
      setAddress(target);
      setReachable(null);
      // un indirizzo non valido resta nel campo con l'errore, ma non si ricorda
      if (!(await runCheck(target))) return;
      try {
        await saveSendAddress(target);
      } catch (e) {
        setError(String(e));
      }
    },
    [runCheck]
  );

  const patch = useCallback((id: number, change: Partial<Transfer>) => {
    setTransfers((list) => list.map((t) => (t.id === id ? { ...t, ...change } : t)));
  }, []);

  // un file alla volta: il server del PC li scrive in ordine e la rete del telefono non si divide
  const drain = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setSending(true);
    try {
      for (let item = queueRef.current.shift(); item; item = queueRef.current.shift()) {
        const { id, file } = item;
        patch(id, { status: "sending" });
        try {
          const saved = await sendFile(addressRef.current, file, ({ sent, total }) => patch(id, { sent, total }));
          setTransfers((list) => list.map((t) => (t.id === id ? { ...t, status: "done", sent: t.total, message: saved } : t)));
          setReachable(true);
        } catch (e) {
          patch(id, { status: "error", message: String(e) });
          // il PC si è spento o ha cambiato rete? lo stato in alto si aggiorna subito
          await runCheck(addressRef.current);
        }
      }
    } finally {
      runningRef.current = false;
      setSending(false);
    }
  }, [patch, addressRef, runCheck]);

  const pickAndSend = useCallback(async () => {
    if (!addressRef.current) {
      setError("Scrivi prima l'indirizzo del PC");
      return;
    }
    let picked: PickedFile[];
    try {
      picked = await pickFiles();
    } catch (e) {
      setError(String(e));
      return;
    }
    if (picked.length === 0) return;
    const items = picked.map((file) => ({ id: nextIdRef.current++, file }));
    queueRef.current.push(...items);
    // i più recenti in cima, come nella pagina dell'iPad
    setTransfers((list) => [
      ...items.map(({ id, file }): Transfer => ({ id, name: file.name, status: "waiting", sent: 0, total: 0, message: null })).reverse(),
      ...list,
    ]);
    void drain();
  }, [drain, addressRef]);

  const check = useCallback(async () => {
    await runCheck(addressRef.current);
  }, [runCheck, addressRef]);
  const clearDone = useCallback(() => setTransfers((list) => list.filter((t) => t.status === "waiting" || t.status === "sending")), []);
  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ ready, address, reachable, checking, error, transfers, sending, connect, check, pickAndSend, clearDone, clearError }),
    [ready, address, reachable, checking, error, transfers, sending, connect, check, pickAndSend, clearDone, clearError]
  );

  // Per card, mini e widget della dashboard: gli stessi campi del ricevitore (vedi useFileTransfer.ts).
  const sentFiles = useMemo<FileEntry[]>(
    () =>
      transfers
        .filter((t) => t.status === "done")
        .map((t) => ({ name: t.message ?? t.name, size: t.total, modified: 0 })),
    [transfers]
  );
  const dashboard = useMemo<FileTransferContextValue>(
    () => ({
      role: "sender",
      ready,
      running: reachable === true,
      address: address || null,
      port: Number(address.split(":").pop()) || FT_PORT,
      busy: sending,
      error,
      files: sentFiles,
      startServer: pickAndSend,
      stopServer: async () => {},
      refreshFiles: check,
      openFolder: async () => {},
      clearError,
    }),
    [ready, reachable, address, sending, error, sentFiles, pickAndSend, check, clearError]
  );

  return (
    <FileSendContext.Provider value={value}>
      <FileTransferContext.Provider value={dashboard}>{children}</FileTransferContext.Provider>
    </FileSendContext.Provider>
  );
}
