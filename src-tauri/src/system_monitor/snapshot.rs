//! Ciò che il monitor manda al frontend (evento `sysmon:snapshot`) e cosa sa leggere su questa macchina
//! (`sysmon_capabilities`). Tipi speculari in `src/widgets/sysmon/data/sysmonApi.ts`.
//!
//! Ogni valore misurato è `Option`: `None` arriva come `null` e la UI mostra "—". Mai 0 al posto di "non so".

#![cfg_attr(not(desktop), allow(dead_code))]

use serde::Serialize;

/// Cosa è leggibile qui: il dialog delle metriche disattiva quelle che non lo sono.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    /// "windows", "macos", "linux" o "mobile".
    pub platform: &'static str,
    /// Falso su Android/iOS: lì il monitor non c'è.
    pub available: bool,
    pub cpu_temp: bool,
    /// Perché la temperatura della CPU manca: "windows" (scelta: servirebbe un driver), "sensor" (nessun sensore).
    pub cpu_temp_reason: Option<&'static str>,
    pub gpu: bool,
    /// Almeno una temperatura (GPU, SSD, CPU sul Mac).
    pub temps: bool,
    pub battery: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// Istante della misura (ms dal 1970).
    pub at_ms: u64,
    pub interval_ms: u64,
    pub system: SystemInfo,
    pub cpu: CpuInfo,
    pub gpus: Vec<GpuInfo>,
    pub memory: MemoryInfo,
    pub disks: Vec<DiskInfo>,
    pub network: NetworkInfo,
    /// Tutte le temperature lette, con il tipo di sensore.
    pub sensors: Vec<Sensor>,
    /// None = nessuna batteria (o non leggibile).
    pub battery: Option<BatteryInfo>,
    /// I 3 processi che usano più CPU.
    pub top_processes: Vec<ProcessInfo>,
    /// Tutti i processi: solo con la pagina di dettaglio aperta.
    pub processes: Option<Vec<ProcessInfo>>,
    pub process_count: Option<usize>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub host_name: Option<String>,
    pub os: Option<String>,
    pub uptime_s: Option<u64>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    /// 0-100 su tutta la CPU.
    pub usage: Option<f32>,
    pub frequency_mhz: Option<u64>,
    pub model: Option<String>,
    pub physical_cores: Option<usize>,
    pub threads: Option<usize>,
    pub temperature_c: Option<f32>,
    /// 0-100 per thread logico: solo con la pagina di dettaglio aperta.
    pub per_thread: Option<Vec<f32>>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: Option<String>,
    pub usage: Option<f32>,
    pub vram_used: Option<u64>,
    pub vram_total: Option<u64>,
    /// Memoria unificata (Apple Silicon): niente VRAM separata, la UI scrive "memoria condivisa".
    pub shared_memory: bool,
    pub temperature_c: Option<f32>,
    /// Percentuale della potenza massima (D3DKMT), non watt.
    pub power_percent: Option<f32>,
    pub fan_rpm: Option<u32>,
    pub clock_mhz: Option<u64>,
    pub memory_clock_mhz: Option<u64>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub used: Option<u64>,
    pub total: Option<u64>,
    pub available: Option<u64>,
    pub swap_used: Option<u64>,
    pub swap_total: Option<u64>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    /// "C:\" su Windows, "/" o "/Volumes/…" su macOS.
    pub mount: String,
    pub total: Option<u64>,
    pub used: Option<u64>,
    pub read_bps: Option<f64>,
    pub write_bps: Option<f64>,
    pub temperature_c: Option<f32>,
    /// Il disco del sistema operativo.
    pub system: bool,
    pub removable: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    /// Somma di tutte le interfacce (senza loopback), byte al secondo.
    pub rx_bps: Option<f64>,
    pub tx_bps: Option<f64>,
    /// L'interfaccia con più traffico nell'ultimo giro (es. "Wi-Fi", "en0").
    pub interface: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sensor {
    pub label: String,
    /// "cpu", "gpu", "disk", "battery" o "other".
    pub kind: &'static str,
    pub temperature_c: Option<f32>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    pub percent: Option<f32>,
    /// "charging", "discharging", "full" o "empty".
    pub state: Option<&'static str>,
    pub minutes_left: Option<u64>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub name: String,
    pub pid: u32,
    /// Quota di tutta la CPU (0-100), come in Gestione attività.
    pub cpu: Option<f32>,
    pub memory: Option<u64>,
    pub gpu: Option<f32>,
    /// Lettura + scrittura, byte al secondo.
    pub disk_bps: Option<f64>,
}
