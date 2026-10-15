import { invoke } from "@tauri-apps/api/core";

/**
 * Unico punto in cui il widget parla con il backend Rust (src-tauri/src/file_transfer.rs).
 * I componenti non chiamano mai invoke() direttamente.
 */

export const FT_PORT = 5000;

export interface FileEntry {
  name: string;
  size: number;
  /** Secondi Unix. */
  modified: number;
}

export interface ServerInfo {
  running: boolean;
  /** "ip:porta" da aprire sull'iPad; null se il server è fermo. */
  address: string | null;
}

export type Preview =
  | { kind: "text"; content: string; truncated: boolean }
  | { kind: "image"; mime: string; base64: string }
  | { kind: "unsupported"; extension: string; size: number };

export const getServerInfo = () => invoke<ServerInfo>("ft_status");
export const startServer = () => invoke<string>("ft_start_server", { port: FT_PORT });
export const stopServer = () => invoke<void>("ft_stop_server");
export const listFiles = () => invoke<FileEntry[]>("ft_list_files");
export const readPreview = (name: string) => invoke<Preview>("ft_read_preview", { name });
export const openReceivedFolder = () => invoke<void>("ft_open_folder");
