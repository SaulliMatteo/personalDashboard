import { invoke } from "@tauri-apps/api/core";
import { basename } from "@tauri-apps/api/path";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { isAndroid } from "../../../core/system/platform";
import { baseName } from "../lib/vault";

/**
 * Le azioni sui file del Quaderno che cambiano per piattaforma, tutte qui:
 * - desktop: si apre col programma del sistema e si mostra nella cartella (plugin opener);
 * - Android: si apre con l'app scelta e, al posto della cartella, si condivide (comandi
 *   `file_open`/`file_share`, src-tauri/src/file_open.rs). La cartella del Quaderno lì non si apre:
 *   sta in Android/data, che i gestori di file non mostrano.
 */

/** Seconda azione sul file accanto ad "Apri": mostrarlo nella cartella o condividerlo. */
export type FileSideAction = "reveal" | "share";

export const fileSideAction: FileSideAction = isAndroid() ? "share" : "reveal";

/** Il pulsante "Apri la cartella" della copia su disco ha senso solo sul desktop. */
export const canOpenVaultFolder = !isAndroid();

/** Errore dei comandi Android: il messaggio è una frase fissa in italiano, da mostrare così com'è. */
class FileActionError extends Error {}

async function androidCommand(command: "file_open" | "file_share", path: string): Promise<void> {
  try {
    await invoke(command, { path });
  } catch (error) {
    throw new FileActionError(typeof error === "string" ? error : "Impossibile aprire il file");
  }
}

/** Messaggio per l'utente: quello del sistema se è una frase nostra (es. "Nessuna app…"), altrimenti `fallback`. */
export function fileErrorMessage(error: unknown, fallback: string): string {
  return error instanceof FileActionError ? error.message : fallback;
}

export async function openFile(path: string): Promise<void> {
  if (isAndroid()) await androidCommand("file_open", path);
  else await openPath(path);
}

/** La seconda azione (vedi `fileSideAction`). */
export async function runFileSideAction(path: string): Promise<void> {
  if (fileSideAction === "share") await androidCommand("file_share", path);
  else await revealItemInDir(path);
}

/** Apre la cartella della copia su disco (solo desktop, vedi `canOpenVaultFolder`). */
export async function openVaultFolder(path: string): Promise<void> {
  await openPath(path);
}

/**
 * Nome di un file scelto con il selettore. Sul desktop è un percorso; su Android un URI `content://`
 * (es. `.../document/image%3A1000`), il cui nome vero (con l'estensione) lo sa solo il sistema.
 */
export async function pickedFileName(path: string): Promise<string> {
  if (!path.startsWith("content://")) return baseName(path);
  try {
    return await basename(path);
  } catch {
    return baseName(decodeURIComponent(path));
  }
}
