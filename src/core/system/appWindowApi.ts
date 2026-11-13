import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isAndroid } from "./platform";

/**
 * Unico punto che parla con l'icona vicino all'orologio e la chiusura della finestra (src-tauri/src/app_tray.rs).
 * Solo nell'app desktop: sul telefono e nel browser le funzioni non fanno nulla.
 */
export const APP_TRAY_AVAILABLE = isTauri() && !isAndroid();

/** La X nasconde la finestra (true) o chiude l'app (false). */
export async function setCloseToTray(enabled: boolean): Promise<void> {
  if (!APP_TRAY_AVAILABLE) return;
  await invoke("app_set_close_to_tray", { enabled });
}

/** Uscita vera, dopo aver salvato. */
export async function quitApp(): Promise<void> {
  if (!APP_TRAY_AVAILABLE) return;
  await invoke("app_quit");
}

/** Riga del menu dell'icona sotto "Apri la dashboard" (es. "Tempo al PC: 5 h 12 min"). */
export async function setTrayToday(text: string): Promise<void> {
  if (!APP_TRAY_AVAILABLE) return;
  await invoke("tray_set_today", { text });
}

/** Avvio col computer: lo stato vero lo tiene il sistema (l'utente può cambiarlo anche da lì). */
export async function getLaunchAtStartup(): Promise<boolean> {
  if (!APP_TRAY_AVAILABLE) return false;
  return invoke<boolean>("app_launch_at_startup");
}

export async function setLaunchAtStartup(enabled: boolean): Promise<boolean> {
  if (!APP_TRAY_AVAILABLE) return false;
  return invoke<boolean>("app_set_launch_at_startup", { enabled });
}

/** L'utente ha scelto "Esci" dal menu dell'icona: chi ascolta salva e poi chiama `quitApp`. */
export function onQuitRequested(handler: () => void): Promise<UnlistenFn> {
  return listen("app:quitting", handler);
}

/** La X ha nascosto la finestra. */
export function onHiddenToTray(handler: () => void): Promise<UnlistenFn> {
  return listen("app:hidden", handler);
}
