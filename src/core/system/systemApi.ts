import { invoke } from "@tauri-apps/api/core";

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
