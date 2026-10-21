export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Secondi Unix -> data e ora locali. */
export function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

/** "foto.jpg" -> "JPG"; senza estensione "FILE". */
export function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toUpperCase() : "FILE";
}
