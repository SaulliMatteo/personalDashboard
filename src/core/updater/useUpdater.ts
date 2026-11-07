import { useEffect, useSyncExternalStore } from "react";
import {
  checkForUpdate,
  describeUpdaterError,
  discardUpdate,
  installUpdate,
  readAppVersion,
  UPDATES_SUPPORTED,
  type AvailableUpdate,
} from "./updaterApi";

/** Fasi del controllo e dell'installazione di un aggiornamento. */
export type UpdaterStatus =
  | { kind: "unsupported" }
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; version: string; notes: string; date: string | null }
  | { kind: "downloading"; version: string; notes: string; progress: number | null }
  | { kind: "installing"; version: string }
  | { kind: "error"; during: "check" | "install"; message: string };

export interface UpdaterState {
  /** Versione installata; null finché non è letta (o fuori da Tauri). */
  currentVersion: string | null;
  status: UpdaterStatus;
}

/*
 * Stato a livello di modulo, non del componente: uscendo dalle Impostazioni durante il download e tornando
 * si ritrova la barra dov'era, e non partono due download insieme.
 */
let state: UpdaterState = { currentVersion: null, status: UPDATES_SUPPORTED ? { kind: "idle" } : { kind: "unsupported" } };
let pending: AvailableUpdate | null = null;
let versionRequested = false;
const listeners = new Set<() => void>();

function setState(next: Partial<UpdaterState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;

const busy = () => ["checking", "downloading", "installing"].includes(state.status.kind);

/**
 * Cerca una versione nuova. `quiet` (il controllo automatico, core/updater/autoCheck.ts): un errore non resta scritto
 * in Impostazioni, si torna allo stato di prima. Restituisce lo stato finale.
 */
async function check(options: { quiet?: boolean } = {}): Promise<UpdaterStatus> {
  if (!UPDATES_SUPPORTED || busy()) return state.status;
  const before = state.status;
  const fail = (message: string) =>
    setState({ status: options.quiet ? (before.kind === "error" ? { kind: "idle" } : before) : { kind: "error", during: "check", message } });
  if (pending) {
    void discardUpdate(pending);
    pending = null;
  }
  setState({ status: { kind: "checking" } });
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    fail("Nessuna connessione a internet.");
    return state.status;
  }
  try {
    const update = await checkForUpdate();
    pending = update;
    setState({
      status: update
        ? { kind: "available", version: update.version, notes: update.notes, date: update.date }
        : { kind: "upToDate" },
    });
  } catch (error) {
    fail(describeUpdaterError(error));
  }
  return state.status;
}

/** Il controllo senza React (core/updater/autoCheck.ts). */
export const checkForUpdates = check;

async function install() {
  const update = pending;
  if (!update || busy()) return;
  setState({ status: { kind: "downloading", version: update.version, notes: update.notes, progress: 0 } });
  try {
    await installUpdate(update, {
      onProgress: (progress) => {
        if (state.status.kind === "downloading") setState({ status: { ...state.status, progress } });
      },
      onInstalling: () => setState({ status: { kind: "installing", version: update.version } }),
    });
  } catch (error) {
    // L'aggiornamento resta in `pending`: "Riprova" lo riscarica da capo.
    setState({ status: { kind: "error", during: "install", message: describeUpdaterError(error) } });
  }
}

/** Stato degli aggiornamenti + azioni. La rete si usa solo da `check` e `install`, mai da sola. */
export function useUpdater() {
  const current = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (versionRequested) return;
    versionRequested = true;
    void readAppVersion().then((version) => setState({ currentVersion: version }));
  }, []);

  return {
    ...current,
    check: () => check(),
    install,
    /** Dopo un errore di installazione si può ancora riprovare la stessa versione. */
    canRetryInstall: current.status.kind === "error" && current.status.during === "install" && pending !== null,
  };
}
