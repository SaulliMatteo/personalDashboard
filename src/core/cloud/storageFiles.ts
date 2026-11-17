import { CloudError } from "./errors";

/*
 * Parti comuni dei bucket di Storage (syncFilesApi.ts, friendFilesApi.ts): nome dei file codificato ed errori.
 */

/** Il nome in base64url: Storage non accetta molti caratteri (accentate, parentesi quadre…) e i nomi sono dell'utente. */
export function encodeName(name: string): string {
  const bytes = new TextEncoder().encode(name);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Errori di Storage: nessuna risposta o 5xx = non raggiungibile; il testo del server non va nei log. */
export function storageError(error: unknown): CloudError {
  const status = Number((error as { statusCode?: unknown; status?: unknown })?.statusCode ?? (error as { status?: unknown })?.status);
  const message = error instanceof Error ? error.message : "";
  if (!Number.isFinite(status) || status === 0 || status >= 500 || /fetch|network|abort/i.test(message)) return new CloudError("unreachable");
  if (status === 401) return new CloudError("auth");
  return new CloudError("unknown");
}

export function isNotFound(error: unknown): boolean {
  const e = error as { statusCode?: unknown; status?: unknown; message?: unknown };
  return String(e?.statusCode ?? e?.status) === "404" || /not.?found/i.test(String(e?.message ?? ""));
}
