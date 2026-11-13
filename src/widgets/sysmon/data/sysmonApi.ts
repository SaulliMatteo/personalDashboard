import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isAndroid } from "../../../core/system/platform";

/**
 * Unico punto in cui il Monitor di sistema parla con il backend Rust (src-tauri/src/system_monitor/).
 * I tipi sono speculari a `snapshot.rs`: ogni valore misurato può essere null ("non disponibile su questa
 * macchina"), e la UI lo mostra come "—", mai come 0.
 */

/**
 * Il monitor legge l'hardware del computer: solo nell'app desktop. Sul telefono e nel browser il widget mostra un
 * messaggio e qui non si chiama nessun comando.
 */
export const SYSMON_AVAILABLE = isTauri() && !isAndroid();

export interface SysmonCapabilities {
  platform: "windows" | "macos" | "linux" | "mobile" | "unsupported";
  available: boolean;
  cpuTemp: boolean;
  /** "windows": scelta (servirebbe un driver del kernel); "sensor": nessun sensore leggibile. */
  cpuTempReason: "windows" | "sensor" | null;
  gpu: boolean;
  temps: boolean;
  battery: boolean;
}

export interface CpuInfo {
  usage: number | null;
  frequencyMhz: number | null;
  model: string | null;
  physicalCores: number | null;
  threads: number | null;
  temperatureC: number | null;
  /** Solo con la pagina di dettaglio aperta. */
  perThread: number[] | null;
}

export interface GpuInfo {
  name: string | null;
  usage: number | null;
  vramUsed: number | null;
  vramTotal: number | null;
  /** Memoria unificata (Apple Silicon): niente VRAM separata. */
  sharedMemory: boolean;
  temperatureC: number | null;
  /** Percentuale della potenza massima, non watt. */
  powerPercent: number | null;
  fanRpm: number | null;
  clockMhz: number | null;
  memoryClockMhz: number | null;
}

export interface MemoryInfo {
  used: number | null;
  total: number | null;
  available: number | null;
  swapUsed: number | null;
  swapTotal: number | null;
}

export interface DiskInfo {
  name: string;
  mount: string;
  total: number | null;
  used: number | null;
  readBps: number | null;
  writeBps: number | null;
  temperatureC: number | null;
  system: boolean;
  removable: boolean;
}

export interface NetworkInfo {
  rxBps: number | null;
  txBps: number | null;
  interface: string | null;
}

export interface Sensor {
  label: string;
  kind: "cpu" | "gpu" | "disk" | "battery" | "other";
  temperatureC: number | null;
}

export interface BatteryInfo {
  percent: number | null;
  state: "charging" | "discharging" | "full" | "empty" | null;
  minutesLeft: number | null;
}

export interface ProcessInfo {
  name: string;
  pid: number;
  /** Quota di tutta la CPU (0-100), come in Gestione attività. */
  cpu: number | null;
  memory: number | null;
  gpu: number | null;
  diskBps: number | null;
}

export interface SysmonSnapshot {
  atMs: number;
  intervalMs: number;
  system: { hostName: string | null; os: string | null; uptimeS: number | null };
  cpu: CpuInfo;
  gpus: GpuInfo[];
  memory: MemoryInfo;
  disks: DiskInfo[];
  network: NetworkInfo;
  sensors: Sensor[];
  /** null = nessuna batteria. */
  battery: BatteryInfo | null;
  topProcesses: ProcessInfo[];
  /** Solo con la pagina di dettaglio aperta. */
  processes: ProcessInfo[] | null;
  processCount: number | null;
}

/** Intervalli di aggiornamento ammessi (secondi), anche in `sysmon_set_interval`. */
export const SYSMON_INTERVALS = [1, 2, 5] as const;
export type SysmonInterval = (typeof SYSMON_INTERVALS)[number];

const EVENT = "sysmon:snapshot";

export const getCapabilities = () => invoke<SysmonCapabilities>("sysmon_capabilities");
/** `detail`: la pagina di dettaglio (lista completa dei processi e CPU per thread). */
export const subscribe = (detail: boolean) => invoke<void>("sysmon_subscribe", { detail });
export const unsubscribe = (detail: boolean) => invoke<void>("sysmon_unsubscribe", { detail });
/** La pagina si è (ri)caricata: toglie le iscrizioni rimaste da quella di prima. */
export const resetSubscriptions = () => invoke<void>("sysmon_reset");
export const setSampleInterval = (seconds: SysmonInterval) => invoke<void>("sysmon_set_interval", { seconds });
export const onSnapshot = (handler: (snapshot: SysmonSnapshot) => void): Promise<UnlistenFn> =>
  listen<SysmonSnapshot>(EVENT, (event) => handler(event.payload));
