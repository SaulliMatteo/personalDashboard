import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isAndroid } from "../system/platform";

/**
 * UNICO punto con le chiamate degli aggiornamenti (tauri-plugin-updater + process, src-tauri/src/updater.rs).
 * Lo usa solo `useUpdater.ts`; nessun widget lo importa. In rete si va solo da `checkForUpdate` e
 * `installUpdate`, cioè quando l'utente preme i pulsanti: niente controlli automatici.
 */

/**
 * Gli aggiornamenti esistono solo nell'app installata: in `tauri dev` (e nel browser) no. Su Android neanche: il
 * plugin c'è solo sul desktop (src/lib.rs) e l'APK nuovo si installa sopra il vecchio.
 */
export const UPDATES_SUPPORTED = !import.meta.env.DEV && !isAndroid();

/** Tempo massimo per scaricare `latest.json`. */
const CHECK_TIMEOUT_MS = 30_000;

/** Versione installata, letta dall'app (tauri.conf.json → package.json). Null fuori da Tauri. */
export async function readAppVersion(): Promise<string | null> {
  try {
    return await getVersion();
  } catch {
    return null;
  }
}

/** Una versione nuova trovata da `checkForUpdate`. */
export interface AvailableUpdate {
  version: string;
  /** Note della release (il corpo della release su GitHub), testo semplice o Markdown. */
  notes: string;
  /** Data di pubblicazione (ISO), se c'è. */
  date: string | null;
  /** Il plugin da usare per installarla: non uscire da questo file. */
  readonly handle: Update;
}

/** Controlla se c'è una versione più nuova. Null = sei aggiornato. Lancia un errore con il messaggio da mostrare. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const update = await check({ timeout: CHECK_TIMEOUT_MS });
  if (!update) return null;
  return { version: update.version, notes: update.body?.trim() ?? "", date: update.date ?? null, handle: update };
}

/** Libera la risorsa lato Rust di un aggiornamento che non si installerà più. */
export async function discardUpdate(update: AvailableUpdate): Promise<void> {
  try {
    await update.handle.close();
  } catch {
    // già chiusa: niente da fare
  }
}

export interface InstallCallbacks {
  /** Avanzamento del download 0..1, null se il server non dice la dimensione. */
  onProgress: (fraction: number | null) => void;
  /** Download finito e verificato: comincia l'installazione. */
  onInstalling: () => void;
}

/**
 * Scarica (firma verificata dal plugin), installa e riavvia. Prima di installare ferma ciò che si ferma alla
 * chiusura della finestra (`updater_prepare_install`): su Windows `install` chiude subito l'app per lanciare
 * l'installer, che poi la riapre, e questa promessa non si risolve mai. Su macOS si riavvia con `relaunch`.
 */
export async function installUpdate(update: AvailableUpdate, { onProgress, onInstalling }: InstallCallbacks): Promise<void> {
  let total = 0;
  let received = 0;
  await update.handle.download((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        onProgress(total > 0 ? 0 : null);
        break;
      case "Progress":
        received += event.data.chunkLength;
        onProgress(total > 0 ? Math.min(1, received / total) : null);
        break;
      case "Finished":
        onProgress(1);
        break;
    }
  });
  onInstalling();
  await invoke("updater_prepare_install");
  await update.handle.install();
  await relaunch();
}

/** Messaggio leggibile da un errore del plugin (di solito una stringa). */
export function describeUpdaterError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "errore sconosciuto";
}
