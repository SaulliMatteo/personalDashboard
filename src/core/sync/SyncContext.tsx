import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { touchDevice } from "../cloud/accountApi";
import { measureClockOffset } from "../cloud/clock";
import { toCloudError } from "../cloud/errors";
import { hasCloudRecords, pullRecords, pushRecords, SYNC_BATCH, SYNC_RECORD_MAX_BYTES } from "../cloud/syncApi";
import { useCloud } from "../cloud/useCloud";
import { getDeviceId } from "../db";
import { useSettings } from "../settings/useSettings";
import { syncRound, type SyncServer } from "./engine/round";
import { SyncScheduler, type SyncFailure } from "./engine/scheduler";
import { emitSyncApplied } from "./syncEvents";
import { SyncRepository } from "./syncRepository";
import { chooseMerge, chooseReplace, finishAdopt, prepareSync, SYNC_KINDS, SYNC_TABLES_ON, syncKeys } from "./syncSetup";
import { SyncContext, type SyncContextValue, type SyncStatus } from "./useSync";

/** Dopo una modifica si aspetta un attimo: più salvataggi ravvicinati partono insieme. */
const CHANGE_DELAY_MS = 5_000;
/** Ogni quanto si guarda se il registro delle modifiche è cambiato (una query locale). */
const OUTBOX_POLL_MS = 4_000;

const OFF: SyncStatus = { kind: "off" };

/** Il giro si ferma finché l'utente non sceglie come unire i dati (non è un errore da mostrare). */
class NeedsChoice extends Error {}

function classifyError(error: unknown): SyncFailure {
  const { code } = toCloudError(error);
  if (code === "unreachable") return "unreachable";
  if (code === "auth") return "auth";
  // solo il nostro codice: il testo del server non va nei log
  console.warn(`Sync: giro non riuscito (${code})`);
  return "other";
}

/**
 * Sync dei propri dati tra i propri dispositivi (core/sync/): parte solo con l'account dei Gruppi pronto e
 * l'impostazione "Sincronizza i miei dati" accesa (spenta di default). Giri: all'avvio, qualche secondo dopo una
 * modifica, al ritorno in primo piano o della rete, ogni 5 minuti, "Sincronizza ora". Dopo ogni giro chi mostra i
 * dati arrivati li rilegge (syncEvents.ts).
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { status: cloud, userId, retry } = useCloud();
  const { settings } = useSettings();
  const activeUser = cloud.kind === "ready" && settings.syncEnabled ? userId : null;
  const [status, setStatus] = useState<SyncStatus>({ kind: "off" });
  const schedulerRef = useRef<SyncScheduler | null>(null);

  useEffect(() => {
    if (!activeUser) return;
    const user = activeUser;
    let stopped = false;
    let deviceId: string | null = null;
    let clockOffset: number | null = null;
    const keys = syncKeys(user);

    const scheduler = new SyncScheduler({
      now: () => Date.now(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
      run: async () => {
        const repo = await SyncRepository.open();
        if (deviceId === null) {
          const id = await getDeviceId(user);
          await touchDevice(id);
          deviceId = id;
        }
        if (clockOffset === null) clockOffset = await measureClockOffset();
        const setup = await prepareSync(repo, user, hasCloudRecords);
        if (setup.kind === "needsChoice") {
          if (!stopped) setStatus({ kind: "needsChoice" });
          throw new NeedsChoice();
        }
        const device = deviceId;
        const server: SyncServer = {
          push: (records) => pushRecords(device, records),
          pull: pullRecords,
        };
        const result = await syncRound(repo, server, {
          deviceId: device,
          clockOffset,
          kinds: SYNC_KINDS,
          adopt: setup.adopt,
          cursorKey: keys.cursor,
          pendingKey: keys.pending,
          batch: SYNC_BATCH,
          maxRecordBytes: SYNC_RECORD_MAX_BYTES,
          onSkipped: (kind, reason) => console.warn(`Sync: elemento non sincronizzato (${kind}, ${reason})`),
        });
        if (setup.adopt) await finishAdopt(repo, user);
        emitSyncApplied({ kinds: result.changed, written: result.written, deleted: result.deleted });
      },
      classifyError: (error) => (error instanceof NeedsChoice ? "other" : classifyError(error)),
      onAuthError: retry,
      onRunning: () => {
        if (!stopped) setStatus((s) => (s.kind === "needsChoice" ? s : { kind: "syncing" }));
      },
      onSuccess: (at) => {
        if (!stopped) setStatus({ kind: "synced", at });
      },
      onFailure: (reason, retryAt) => {
        if (stopped) return;
        setStatus((s) => (s.kind === "needsChoice" ? s : { kind: "failed", reason: reason === "unreachable" ? "unreachable" : "other", retryAt }));
      },
    });
    schedulerRef.current = scheduler;
    scheduler.request(0);

    // una modifica nuova nel registro → giro tra poco
    let lastChange: number | null = null;
    const poll = window.setInterval(() => {
      void SyncRepository.open()
        .then((repo) => repo.outboxSummary(SYNC_TABLES_ON))
        .then(({ count, last }) => {
          if (lastChange !== null && last !== lastChange && count > 0) scheduler.request(CHANGE_DELAY_MS);
          lastChange = last;
        })
        .catch(() => undefined);
    }, OUTBOX_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduler.request(0);
    };
    const onOnline = () => scheduler.retryNow();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      scheduler.stop();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [activeUser, retry]);

  const syncNow = useCallback(() => schedulerRef.current?.retryNow(), []);

  const choose = useCallback(
    async (choice: "merge" | "replace") => {
      if (!activeUser) return;
      const repo = await SyncRepository.open();
      if (choice === "merge") {
        await chooseMerge(repo, activeUser);
      } else {
        // le righe di qui sono sparite: chi le mostra le rilegge (e le Note tolgono le loro cartelle su disco)
        const deleted = await chooseReplace(repo, activeUser);
        emitSyncApplied({ kinds: new Set(deleted.keys()), written: new Map(), deleted });
      }
      setStatus({ kind: "syncing" });
      schedulerRef.current?.retryNow();
    },
    [activeUser]
  );

  // spento (o senza account) lo stato dell'ultimo giro non conta più
  const shown: SyncStatus = activeUser ? status : OFF;
  const value = useMemo<SyncContextValue>(() => ({ status: shown, syncNow, choose }), [shown, syncNow, choose]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
