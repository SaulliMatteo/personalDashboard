import { useSyncExternalStore } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { clearWallpaper, getWallpaper, saveWallpaper } from "./wallpaperRepository";

/**
 * Sfondo del tema Vetro scelto dall'utente: un'immagine per dispositivo, mai sincronizzata (tabella
 * `device_wallpaper`). Si salva già ridimensionata (lato lungo al massimo 1600 px, JPEG): dietro il vetro è
 * sfocata, una foto più grande occuperebbe solo spazio. Senza immagine si vede la stanza disegnata (GlassWall).
 */

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

let current: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    getWallpaper()
      .then((url) => {
        current = url;
        emit();
      })
      .catch((error) => console.error("Sfondo di Vetro non letto:", error));
  }
  return () => listeners.delete(listener);
}

/** L'immagine di sfondo (data: URL) o null = la stanza disegnata. */
export function useWallpaper(): string | null {
  return useSyncExternalStore(subscribe, () => current);
}

/** Ridimensiona su un canvas e restituisce un JPEG come data: URL (la CSP permette già `data:`). */
async function toJpeg(bytes: Uint8Array): Promise<string> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas non disponibile");
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/** Apre la scelta del file; false se l'utente annulla. Lancia un errore se l'immagine non si legge. */
export async function chooseWallpaper(): Promise<boolean> {
  const picked = await openDialog({ multiple: false, filters: [{ name: "Immagini", extensions: IMAGE_EXTENSIONS }] });
  if (!picked || Array.isArray(picked)) return false;
  const url = await toJpeg(await readFile(picked));
  await saveWallpaper(url);
  current = url;
  emit();
  return true;
}

/** Torna alla stanza disegnata. */
export async function resetWallpaper(): Promise<void> {
  await clearWallpaper();
  current = null;
  emit();
}
