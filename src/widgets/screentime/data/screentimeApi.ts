import { invoke, isTauri } from "@tauri-apps/api/core";
import { isAndroid } from "../../../core/system/platform";
import { systemSignalsAvailable } from "../../../core/system/systemApi";
import type { RawSegment } from "../lib/classify";
import type { PhoneEvents } from "../lib/androidEvents";
import type { DeviceKind } from "../lib/devices";

/**
 * Unico punto in cui Tempo allo schermo parla con il Rust: il registratore del computer (src-tauri/src/screen_time/)
 * e, sul telefono, la cronologia di uso delle app di Android (src-tauri/src/screen_time/android.rs). Si guarda
 * ovunque ci sia il DB (anche Linux), con le righe arrivate col sync. Nel browser il widget mostra solo il messaggio.
 */
export const SCREENTIME_VIEWABLE = isTauri();
/** Registratore del computer (Windows e macOS): limiti, pause e menu dell'icona ci sono solo qui. */
export const SCREENTIME_AVAILABLE = SCREENTIME_VIEWABLE && systemSignalsAvailable();
/** Telefono: si conta leggendo la cronologia di Android, con il permesso "Accesso ai dati di utilizzo". */
export const SCREENTIME_PHONE = SCREENTIME_VIEWABLE && isAndroid();
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

/** Telefono: il permesso "Accesso ai dati di utilizzo" c'è. */
export async function usageAccessGranted(): Promise<boolean> {
  if (!SCREENTIME_PHONE) return false;
  return invoke<boolean>("screentime_usage_access");
}

/** Telefono: apre la pagina di Android dove si accende il permesso. */
export async function openUsageAccessSettings(): Promise<void> {
  if (!SCREENTIME_PHONE) return;
  await invoke("screentime_usage_open_settings");
}

/** Telefono: gli eventi di uso tra `since` e `until` (ms). */
export async function usageEvents(since: number, until: number): Promise<PhoneEvents> {
  return invoke<PhoneEvents>("screentime_usage_events", { since: Math.floor(since), until: Math.floor(until) });
}
