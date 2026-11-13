import { invoke, isTauri } from "@tauri-apps/api/core";
import { systemSignalsAvailable } from "../../../core/system/systemApi";
import type { RawSegment } from "../lib/classify";

/**
 * Unico punto in cui Tempo al PC parla con il registratore in Rust (src-tauri/src/screen_time/).
 * Solo nell'app desktop su Windows e macOS: altrove il widget mostra il messaggio e qui non si chiama nulla.
 */
export const SCREENTIME_AVAILABLE = isTauri() && systemSignalsAvailable();

/** Avvia il conteggio (o cambia la soglia di inattività). false = non supportato. */
export async function startRecorder(idleSeconds: number): Promise<boolean> {
  if (!SCREENTIME_AVAILABLE) return false;
  return invoke<boolean>("screentime_start", { idleSeconds });
}

/** Segmenti da contare dall'ultimo ritiro (ogni secondo arriva una volta sola). */
export async function takeSegments(): Promise<RawSegment[]> {
  if (!SCREENTIME_AVAILABLE) return [];
  return invoke<RawSegment[]>("screentime_take");
}

/** Ferma il conteggio e restituisce l'ultimo pezzo. */
export async function stopRecorder(): Promise<RawSegment[]> {
  if (!SCREENTIME_AVAILABLE) return [];
  return invoke<RawSegment[]>("screentime_stop");
}
