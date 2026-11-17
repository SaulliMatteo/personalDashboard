import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isAndroid, isWindows } from "../../../core/system/platform";
import { systemSignalsAvailable } from "../../../core/system/systemApi";
import type { RawSegment } from "../lib/classify";
import type { PhoneEvents } from "../lib/androidEvents";
import type { DeviceKind } from "../lib/devices";
import type { BlockTarget, LimitKind } from "../lib/limits";

/**
 * Unico punto in cui Tempo allo schermo parla con il Rust: il registratore del computer (src-tauri/src/screen_time/)
 * e, sul telefono, la cronologia di uso delle app di Android (src-tauri/src/screen_time/android.rs). Si guarda
 * ovunque ci sia il DB (anche Linux), con le righe arrivate col sync. Nel browser il widget mostra solo il messaggio.
 */
export const SCREENTIME_VIEWABLE = isTauri();
/** Registratore del computer (Windows e macOS): limiti, pause e menu dell'icona ci sono solo qui. */
export const SCREENTIME_AVAILABLE = SCREENTIME_VIEWABLE && systemSignalsAvailable();
/** Blocco delle app al limite: solo Windows (src-tauri/src/screen_block.rs). */
export const SCREENBLOCK_AVAILABLE = SCREENTIME_AVAILABLE && isWindows();
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

// ----------------------------------------------------------------- blocco delle app (solo Windows)

/** Aspetto della schermata di blocco: quello della dashboard in quel momento. */
export interface BlockLook {
  theme: string;
  mode: string;
}

/** Finestra principale: le app da coprire adesso (lista vuota = niente blocco). */
export async function setBlockTargets(day: string, targets: BlockTarget[], look: BlockLook): Promise<void> {
  if (!SCREENBLOCK_AVAILABLE) return;
  await invoke("screenblock_set", { day, targets, theme: look.theme, mode: look.mode });
}

/** Dalla schermata di blocco è stato chiesto "Altri 15 minuti": la finestra principale lo salva. */
export function onBlockExtended(handler: (e: { limitId: number; until: number; day: string }) => void): Promise<UnlistenFn> {
  return listen<{ limitId: number; until: number; day: string }>("screenblock:extended", (event) => handler(event.payload));
}

/** Quello che la schermata di blocco mostra (finestra "blocco"). */
export interface BlockShown {
  app: string;
  label: string;
  kind: LimitKind;
  usedSeconds: number;
  maxSeconds: number;
  canExtend: boolean;
  theme: string;
  mode: string;
}

export async function currentBlock(): Promise<BlockShown | null> {
  return invoke<BlockShown | null>("screenblock_current");
}

/** Il Rust ha cambiato quello da mostrare (altra app, proroga…). */
export function onBlockChanged(handler: () => void): Promise<UnlistenFn> {
  return listen("screenblock:changed", handler);
}

/** "Chiudi …": chiede all'app coperta di chiudersi, come la X (può chiedere di salvare). */
export async function closeBlockedApp(): Promise<void> {
  await invoke("screenblock_close_target");
}

/** "Altri 15 minuti" (una volta al giorno per limite: lo controlla il Rust). */
export async function extendBlock(): Promise<boolean> {
  return invoke<boolean>("screenblock_extend");
}

/** "Apri la dashboard": mostra la finestra principale sulla pagina di Tempo allo schermo. */
export async function openDashboardFromBlock(): Promise<void> {
  await invoke("screenblock_open_dashboard");
}
