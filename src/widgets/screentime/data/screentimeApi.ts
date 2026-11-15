import { invoke, isTauri } from "@tauri-apps/api/core";
import { isAndroid } from "../../../core/system/platform";
import { systemSignalsAvailable } from "../../../core/system/systemApi";
import type { RawSegment } from "../lib/classify";
import type { DeviceKind } from "../lib/devices";

/**
 * Unico punto in cui Tempo allo schermo parla con il registratore in Rust (src-tauri/src/screen_time/).
 * Conta solo nell'app desktop su Windows e macOS; si guarda ovunque ci sia il DB (anche telefono e Linux), con le
 * righe arrivate col sync. Nel browser il widget mostra solo il messaggio.
 */
export const SCREENTIME_VIEWABLE = isTauri();
export const SCREENTIME_AVAILABLE = SCREENTIME_VIEWABLE && systemSignalsAvailable();
/** Il tipo di questo dispositivo, scritto nelle righe contate qui. */
export const THIS_DEVICE: DeviceKind = isAndroid() ? "phone" : "computer";

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
