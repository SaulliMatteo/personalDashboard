import { invoke } from "@tauri-apps/api/core";
import { isAndroid } from "./platform";

/**
 * Ci sono i segnali di sistema (app in primo piano, inattività del computer)? Solo su Windows e macOS
 * (src-tauri/src/companion.rs). Altrove (Android, Linux) chi li usa nasconde le parti che ne dipendono.
 */
export function systemSignalsAvailable(): boolean {
  return typeof navigator !== "undefined" && !isAndroid() && /Windows|Macintosh/.test(navigator.userAgent);
}

/** Risposta di `companion_snapshot` (src-tauri/src/companion.rs). */
export interface SystemSnapshot {
  idleSeconds: number | null;
  foreground: { process: string; description: string; title: string; isSelf: boolean } | null;
  supported: boolean;
}

/**
 * Inattività di sistema + finestra in primo piano. Fuori da Tauri (es.
 * `npm run dev` nel browser) o su sistemi non supportati ritorna null:
 * chi lo usa ripiega (il Companion sui soli eventi della finestra, lo Studio
 * rinuncia allo stop automatico).
 */
export async function readSystemSnapshot(includeForeground: boolean): Promise<SystemSnapshot | null> {
  try {
    const snap = await invoke<SystemSnapshot>("companion_snapshot", { includeForeground });
    return snap.supported ? snap : null;
  } catch {
    return null;
  }
}
