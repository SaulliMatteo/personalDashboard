import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * L'unico punto della Lavagna che parla con la finestra Tauri: lo schermo
 * intero (permesso `core:window:allow-set-fullscreen` in capabilities/default.json).
 */
export function setWindowFullscreen(on: boolean): Promise<void> {
  return getCurrentWindow().setFullscreen(on);
}

export function isWindowFullscreen(): Promise<boolean> {
  return getCurrentWindow().isFullscreen();
}

/** Avvisa quando la finestra cambia dimensione (anche entrando o uscendo dallo schermo intero). Restituisce lo "stacca". */
export function onWindowResized(callback: () => void): Promise<() => void> {
  return getCurrentWindow().onResized(callback);
}
