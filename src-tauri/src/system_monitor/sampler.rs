//! Il campionatore del desktop: sysinfo per CPU, memoria, dischi, rete e processi, starship-battery per la
//! batteria, più le parti di sistema (`windows.rs`, `macos.rs`). Linux usa solo la parte comune.
//!
//! Vive nel thread di campionamento (`mod.rs`): ogni `sample` misura ciò che è successo dal giro precedente.

use std::time::{Instant, SystemTime, UNIX_EPOCH};

use sysinfo::{CpuRefreshKind, DiskRefreshKind, Disks, MemoryRefreshKind, Networks, ProcessRefreshKind, ProcessesToUpdate, System};

use super::snapshot::*;
use super::units;

/// Interfacce di rete da non contare (traffico interno della macchina).
fn is_loopback(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n == "lo" || n == "lo0" || n.starts_with("loopback")
}

/// Volumi che non sono dischi dell'utente: su macOS i volumi di sistema di APFS ripetono "/" (stesso spazio).
fn is_hidden_mount(mount: &str) -> bool {
    mount.starts_with("/System/Volumes/") || mount.starts_with("/private/") || mount.starts_with("/snap/") || mount.starts_with("/boot")
}

/// Il volume del sistema operativo: "C:\" (o quello di %SystemDrive%) su Windows, "/" altrove.
fn system_mount() -> String {
    if cfg!(windows) {
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
        format!("{drive}\\")
    } else {
        "/".into()
    }
}

/// Nome da mostrare per un processo: su Windows senza ".exe", come nel mockup.
fn process_name(raw: &std::ffi::OsStr) -> String {
    let name = raw.to_string_lossy();
    match name.len().checked_sub(4) {
        Some(cut) if name[cut..].eq_ignore_ascii_case(".exe") => name[..cut].to_string(),
        _ => name.into_owned(),
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub struct Sampler {
    sys: System,
    disks: Disks,
    networks: Networks,
    battery: Option<starship_battery::Manager>,
    last: Instant,
    threads: usize,
    system_mount: String,
    #[cfg(windows)]
    win: super::windows::WinSampler,
    #[cfg(target_os = "macos")]
    mac: super::macos::MacSampler,
}

impl Sampler {
    pub fn new() -> Result<Self, String> {
        let mut sys = System::new().map_err(|e| e.to_string())?;
        // Prima lettura: utilizzo di CPU e processi, che sysinfo calcola come differenza tra due giri.
        sys.refresh_cpu_specifics(CpuRefreshKind::nothing().with_usage().with_frequency());
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, Self::process_kind());
        let disks = Disks::new_with_refreshed_list_specifics(DiskRefreshKind::nothing().with_storage().with_io_usage())
            .map_err(|e| e.to_string())?;
        let networks = Networks::new_with_refreshed_list().map_err(|e| e.to_string())?;
        let threads = sys.cpus().len();
        Ok(Sampler {
            sys,
            disks,
            networks,
            battery: starship_battery::Manager::new().ok(),
            last: Instant::now(),
            threads,
            system_mount: system_mount(),
            #[cfg(windows)]
            win: super::windows::WinSampler::new(),
            #[cfg(target_os = "macos")]
            mac: super::macos::MacSampler::new(),
        })
    }

    fn process_kind() -> ProcessRefreshKind {
        ProcessRefreshKind::nothing().with_cpu().with_memory().with_disk_usage()
    }

    /// Cosa si riesce a leggere su questa macchina (serve una misura vera: alcune cose dipendono dal driver).
    pub fn capabilities(&mut self) -> Capabilities {
        let snapshot = self.sample(false, 0);
        let any_temp = snapshot.sensors.iter().any(|s| s.temperature_c.is_some());
        let platform = if cfg!(windows) {
            "windows"
        } else if cfg!(target_os = "macos") {
            "macos"
        } else {
            "linux"
        };
        let cpu_temp = snapshot.cpu.temperature_c.is_some();
        Capabilities {
            platform,
            available: true,
            cpu_temp,
            cpu_temp_reason: match () {
                _ if cfg!(windows) => Some("windows"),
                _ if !cpu_temp => Some("sensor"),
                _ => None,
            },
            gpu: self.has_gpu(),
            temps: any_temp,
            battery: snapshot.battery.is_some(),
        }
    }

    fn has_gpu(&self) -> bool {
        #[cfg(windows)]
        return self.win.has_gpu();
        #[cfg(target_os = "macos")]
        return self.mac.has_gpu();
        #[cfg(not(any(windows, target_os = "macos")))]
        false
    }

    /// Una misura. `detail` aggiunge la lista completa dei processi e l'utilizzo per thread.
    pub fn sample(&mut self, detail: bool, interval_ms: u64) -> Snapshot {
        let elapsed_ms = self.last.elapsed().as_millis() as u64;
        self.last = Instant::now();

        self.sys.refresh_cpu_specifics(CpuRefreshKind::nothing().with_usage().with_frequency());
        self.sys.refresh_memory_specifics(MemoryRefreshKind::nothing().with_ram().with_swap());
        self.sys.refresh_processes_specifics(ProcessesToUpdate::All, true, Self::process_kind());
        self.disks.refresh_specifics(true, DiskRefreshKind::nothing().with_storage().with_io_usage());
        self.networks.refresh(true);

        #[cfg(windows)]
        let win = self.win.read();

        let mut snap = Snapshot {
            at_ms: now_ms(),
            interval_ms,
            system: SystemInfo {
                host_name: System::host_name().ok(),
                os: System::long_os_version().ok(),
                uptime_s: System::uptime().ok(),
            },
            ..Default::default()
        };

        // ---- CPU ----
        let cpus = self.sys.cpus();
        snap.cpu = CpuInfo {
            usage: Some(self.sys.global_cpu_usage()).filter(|u| u.is_finite()).map(|u| u.clamp(0.0, 100.0)),
            frequency_mhz: cpus.iter().map(|c| c.frequency()).max().and_then(units::nonzero_mhz),
            model: cpus.first().map(|c| c.brand().trim().to_string()).filter(|b| !b.is_empty()),
            physical_cores: System::physical_core_count().ok(),
            threads: Some(self.threads).filter(|t| *t > 0),
            temperature_c: None,
            per_thread: detail.then(|| cpus.iter().map(|c| c.usage().clamp(0.0, 100.0)).collect()),
        };
        // Su Windows sysinfo dà la frequenza base: quella attuale viene da `% Processor Performance`.
        #[cfg(windows)]
        if win.cpu_frequency_mhz.is_some() {
            snap.cpu.frequency_mhz = win.cpu_frequency_mhz;
        }

        // ---- Memoria ----
        let total = self.sys.total_memory();
        snap.memory = MemoryInfo {
            used: (total > 0).then(|| self.sys.used_memory()),
            total: (total > 0).then_some(total),
            available: (total > 0).then(|| self.sys.available_memory()),
            swap_used: Some(self.sys.used_swap()),
            swap_total: Some(self.sys.total_swap()),
        };

        // ---- Dischi ----
        for disk in self.disks.iter() {
            let mount = disk.mount_point().to_string_lossy().into_owned();
            if is_hidden_mount(&mount) || disk.total_space() == 0 {
                continue;
            }
            let usage = disk.usage();
            let total = disk.total_space();
            #[cfg(windows)]
            let temperature_c = self.win.volume_temperature(&mount);
            #[cfg(not(windows))]
            let temperature_c = None;
            snap.disks.push(DiskInfo {
                name: disk.name().to_string_lossy().into_owned(),
                system: mount.eq_ignore_ascii_case(&self.system_mount),
                mount,
                total: Some(total),
                used: Some(total.saturating_sub(disk.available_space())),
                read_bps: units::disk_rate(usage.read_bytes, usage.total_read_bytes, elapsed_ms),
                write_bps: units::disk_rate(usage.written_bytes, usage.total_written_bytes, elapsed_ms),
                temperature_c,
                removable: disk.is_removable(),
            });
        }

        // ---- Rete ----
        let mut rx = 0u64;
        let mut tx = 0u64;
        let mut busiest: Option<(&str, u64)> = None;
        let names: Vec<&str> = self.networks.keys().map(|n| n.to_str().unwrap_or("")).collect();
        for (name, data) in self.networks.iter() {
            let name = name.to_str().unwrap_or("");
            if is_loopback(name) || units::is_filter_instance(name, &names) {
                continue;
            }
            rx += data.received();
            tx += data.transmitted();
            let traffic = data.received() + data.transmitted();
            if busiest.is_none_or(|(_, t)| traffic > t) {
                busiest = Some((name, traffic));
            }
        }
        let has_interfaces = busiest.is_some();
        snap.network = NetworkInfo {
            rx_bps: has_interfaces.then(|| units::per_second(rx, elapsed_ms)).flatten(),
            tx_bps: has_interfaces.then(|| units::per_second(tx, elapsed_ms)).flatten(),
            interface: busiest.map(|(n, _)| n.to_string()).filter(|n| !n.is_empty()),
        };

        // ---- GPU e sensori ----
        #[cfg(windows)]
        {
            for g in &win.gpus {
                snap.gpus.push(GpuInfo {
                    name: g.name.clone(),
                    usage: g.usage,
                    vram_used: g.vram_used,
                    vram_total: g.vram_total,
                    shared_memory: false,
                    temperature_c: g.temperature_c,
                    power_percent: g.power_percent,
                    fan_rpm: g.fan_rpm,
                    clock_mhz: g.clock_mhz,
                    memory_clock_mhz: g.memory_clock_mhz,
                });
            }
            for g in &snap.gpus {
                if g.temperature_c.is_some() {
                    let label = g.name.clone().unwrap_or_else(|| "GPU".into());
                    snap.sensors.push(Sensor { label, kind: "gpu", temperature_c: g.temperature_c });
                }
            }
            for d in &snap.disks {
                if d.temperature_c.is_some() {
                    snap.sensors.push(Sensor { label: d.mount.trim_end_matches('\\').to_string(), kind: "disk", temperature_c: d.temperature_c });
                }
            }
        }
        #[cfg(target_os = "macos")]
        {
            snap.sensors = self.mac.sensors();
            snap.cpu.temperature_c = units::pick_cpu_temp(
                snap.sensors.iter().filter_map(|s| s.temperature_c.map(|t| (s.label.as_str(), t))),
            );
            for g in self.mac.gpus() {
                snap.gpus.push(GpuInfo { name: g.name, usage: g.usage, shared_memory: g.shared_memory, ..Default::default() });
            }
        }

        // ---- Batteria ----
        snap.battery = self.battery.as_ref().and_then(read_battery);

        // ---- Processi ----
        #[cfg(windows)]
        let gpu_by_process = &win.gpu_by_process;
        let mut processes: Vec<ProcessInfo> = self
            .sys
            .processes()
            .values()
            .filter(|p| p.pid().as_u32() != 0)
            .map(|p| {
                let disk = p.disk_usage();
                let pid = p.pid().as_u32();
                #[cfg(windows)]
                let gpu = gpu_by_process.get(&pid).copied().or(Some(0.0)).filter(|_| !gpu_by_process.is_empty());
                #[cfg(not(windows))]
                let gpu = None;
                ProcessInfo {
                    name: process_name(p.name()),
                    pid,
                    cpu: units::process_cpu_percent(p.cpu_usage(), self.threads),
                    memory: Some(p.memory()),
                    gpu,
                    disk_bps: units::per_second(disk.read_bytes + disk.written_bytes, elapsed_ms),
                }
            })
            .collect();
        processes.sort_by(|a, b| b.cpu.unwrap_or(0.0).total_cmp(&a.cpu.unwrap_or(0.0)));
        snap.process_count = Some(processes.len());
        snap.top_processes = processes.iter().take(3).cloned().collect();
        snap.processes = detail.then_some(processes);
        snap
    }
}

fn read_battery(manager: &starship_battery::Manager) -> Option<BatteryInfo> {
    use starship_battery::units::ratio::percent;
    use starship_battery::units::time::second;
    use starship_battery::State;
    let battery = manager.batteries().ok()?.flatten().next()?;
    let state = match battery.state() {
        State::Charging => Some("charging"),
        State::Discharging => Some("discharging"),
        State::Full => Some("full"),
        State::Empty => Some("empty"),
        State::Unknown | State::Paused => None,
    };
    let charge = battery.state_of_charge().get::<percent>();
    Some(BatteryInfo {
        percent: (charge.is_finite() && (0.0..=100.0).contains(&charge)).then_some(charge),
        state,
        minutes_left: battery.time_to_empty().map(|t| (t.get::<second>() / 60.0) as u64).filter(|m| *m > 0),
    })
}
