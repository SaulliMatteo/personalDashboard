import { BaseDirectory, readFile } from "@tauri-apps/plugin-fs";
import { VAULT_DIR } from "./vault";

/**
 * Le immagini delle pagine stanno nella cartella della nota su disco (allegati/), non nel DB.
 * Per mostrarle si leggono i byte e se ne fa un URL "blob:" (una volta per file, poi dalla cache).
 * Niente asset protocol: non serve cambiare la configurazione di Tauri.
 */

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const IMAGE_EXTENSIONS = Object.keys(MIME);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isImageName(name: string): boolean {
  return extensionOf(name) in MIME;
}

export function mimeOf(name: string): string {
  return MIME[extensionOf(name)] ?? "application/octet-stream";
}

function relativePath(noteDir: string, name: string): string {
  return `${VAULT_DIR}/${noteDir}/allegati/${name}`;
}

const urls = new Map<string, Promise<string>>();

/** URL da mettere in <img src>. La cache vale finché la pagina Notes resta aperta. */
export function attachmentUrl(noteDir: string, name: string): Promise<string> {
  const key = relativePath(noteDir, name);
  let url = urls.get(key);
  if (!url) {
    url = readFile(key, { baseDir: BaseDirectory.Document }).then((bytes) =>
      URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(name) }))
    );
    // Se la lettura fallisce si riprova la volta dopo.
    url.catch(() => urls.delete(key));
    urls.set(key, url);
  }
  return url;
}

/** Il file come data: URL (per l'esportazione, che disegna la pagina in un'immagine SVG). */
export async function attachmentDataUrl(noteDir: string, name: string): Promise<string> {
  const bytes = await readFile(relativePath(noteDir, name), { baseDir: BaseDirectory.Document });
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mimeOf(name)};base64,${btoa(binary)}`;
}

/** Si chiama lasciando la pagina Notes: libera la memoria delle immagini. */
export function releaseAttachmentUrls(): void {
  for (const url of urls.values()) void url.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
  urls.clear();
}

/** Dimensioni originali di un'immagine (per le proporzioni nel blocco). */
export function imageSize(bytes: Uint8Array, name: string): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(name) }));
  const img = new Image();
  img.src = url;
  return img
    .decode()
    .then(() => ({ width: img.naturalWidth, height: img.naturalHeight }))
    .finally(() => URL.revokeObjectURL(url));
}
