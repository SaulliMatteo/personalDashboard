import { invoke } from "@tauri-apps/api/core";

/**
 * Dove si conserva la sessione dei Gruppi. È l'unica parte di `core/cloud` legata alla piattaforma:
 * per un'app mobile basterà un'altra implementazione di questa interfaccia.
 * Stessa forma dello `storage` di supabase-js.
 */
export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Errore del portachiavi: il messaggio è una frase fissa del comando Rust, mai il valore. */
export class SecureStorageError extends Error {}

async function call<T>(command: string, args: Record<string, string>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw new SecureStorageError(typeof e === "string" ? e : "Portachiavi del sistema non disponibile");
  }
}

/** Desktop: portachiavi del sistema tramite i comandi di src-tauri/src/secure_store.rs. */
export const secureStorage: SecureStorage = {
  getItem: (key) => call<string | null>("secure_store_get", { key }),
  setItem: (key, value) => call<void>("secure_store_set", { key, value }),
  removeItem: (key) => call<void>("secure_store_remove", { key }),
};
