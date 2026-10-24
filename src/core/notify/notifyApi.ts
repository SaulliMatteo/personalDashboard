import { invoke } from "@tauri-apps/api/core";

/**
 * Notifica di sistema con un'immagine (la faccia di Pixy), mostrata dal comando Rust
 * `notify_with_image` (src-tauri/src/notify.rs): il plugin delle notifiche su Windows
 * ignora le immagini. Ritorna false dove non è supportata (oggi: fuori da Windows,
 * fuori da Tauri) o se fallisce: chi chiama ripiega sulla notifica semplice.
 */
export async function showNotificationWithImage(title: string, lines: string[], imageDataUrl: string): Promise<boolean> {
  try {
    return await invoke<boolean>("notify_with_image", { title, lines, imageDataUrl });
  } catch (error) {
    console.error("Notifica con immagine non riuscita:", error);
    return false;
  }
}
