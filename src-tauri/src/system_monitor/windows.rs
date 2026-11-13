//! Windows: GPU di qualsiasi produttore (PDH + D3DKMT), temperatura degli SSD (IOCTL) e frequenza attuale della
//! CPU (PDH). Tutto con API in modalità utente e senza privilegi: niente driver (WinRing0 & co.), niente WMI.
//!
//! La temperatura della CPU su Windows NON si legge: senza un driver del kernel non c'è un modo affidabile
//! (`capabilities.cpuTemp` è falso con il motivo "windows").

use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::{size_of, zeroed};
use std::ptr::{null, null_mut};

use windows_sys::Wdk::Graphics::Direct3D::{
    D3DKMTCloseAdapter, D3DKMTEnumAdapters2, D3DKMTQueryAdapterInfo, D3DKMT_ADAPTERINFO, D3DKMT_ADAPTERREGISTRYINFO,
    D3DKMT_ADAPTERTYPE, D3DKMT_ADAPTER_PERFDATA, D3DKMT_CLOSEADAPTER, D3DKMT_ENUMADAPTERS2, D3DKMT_NODE_PERFDATA,
    D3DKMT_QUERYADAPTERINFO, D3DKMT_SEGMENTSIZEINFO, KMTQAITYPE_ADAPTERPERFDATA, KMTQAITYPE_ADAPTERREGISTRYINFO,
    KMTQAITYPE_ADAPTERTYPE, KMTQAITYPE_GETSEGMENTSIZE, KMTQAITYPE_NODEPERFDATA, KMTQUERYADAPTERINFOTYPE,
};
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
use windows_sys::Win32::System::Ioctl::{
    PropertyStandardQuery, StorageAdapterTemperatureProperty, StorageDeviceTemperatureProperty, IOCTL_STORAGE_GET_DEVICE_NUMBER,
    IOCTL_STORAGE_QUERY_PROPERTY, STORAGE_DEVICE_NUMBER, STORAGE_PROPERTY_ID, STORAGE_PROPERTY_QUERY,
    STORAGE_TEMPERATURE_DATA_DESCRIPTOR,
};
use windows_sys::Win32::System::IO::DeviceIoControl;
use windows_sys::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhGetFormattedCounterValue,
    PdhOpenQueryW, PDH_FMT_COUNTERVALUE, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_MORE_DATA,
};
use windows_sys::Win32::System::Power::{CallNtPowerInformation, ProcessorInformation, PROCESSOR_POWER_INFORMATION};

use super::units::{self, Luid};

/// Dischi fisici provati (`\\.\PhysicalDrive0..N`) per le temperature.
const MAX_PHYSICAL_DRIVES: u32 = 16;
/// Bit di `D3DKMT_ADAPTERTYPE`: la scheda disegna (le NPU e i display senza GPU no) / è il renderer software.
const ADAPTER_RENDER_SUPPORTED: u32 = 1 << 0;
const ADAPTER_SOFTWARE_DEVICE: u32 = 1 << 2;
/// `PDH_CSTATUS_VALID_DATA` / `PDH_CSTATUS_NEW_DATA`: gli altri stati sono valori da scartare.
const PDH_VALID: [u32; 2] = [0, 1];

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn from_wide(buf: &[u16]) -> String {
    let len = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len]).trim().to_string()
}

// ---------------------------------------------------------------------------------------------------------------
// PDH
// ---------------------------------------------------------------------------------------------------------------

/// Una query PDH con i contatori del monitor. I contatori "a differenza" (utilizzo, performance) hanno un valore
/// solo dalla seconda raccolta: la prima si fa subito in `new`.
struct Pdh {
    query: isize,
    gpu_engine: Option<isize>,
    gpu_memory: Option<isize>,
    cpu_performance: Option<isize>,
}

impl Pdh {
    fn new() -> Option<Self> {
        let mut query = 0isize;
        // SAFETY: puntatore di uscita valido; sorgente nulla = dati in tempo reale.
        if unsafe { PdhOpenQueryW(null(), 0, &mut query) } != 0 {
            return None;
        }
        let add = |path: &str| {
            let path = wide(path);
            let mut counter = 0isize;
            // SAFETY: query aperta sopra, stringa terminata da 0, puntatore di uscita valido.
            (unsafe { PdhAddEnglishCounterW(query, path.as_ptr(), 0, &mut counter) } == 0).then_some(counter)
        };
        let pdh = Pdh {
            query,
            gpu_engine: add(r"\GPU Engine(*)\Utilization Percentage"),
            gpu_memory: add(r"\GPU Adapter Memory(*)\Dedicated Usage"),
            cpu_performance: add(r"\Processor Information(_Total)\% Processor Performance"),
        };
        pdh.collect();
        Some(pdh)
    }

    fn collect(&self) -> bool {
        // SAFETY: query valida per tutta la vita di `self`.
        unsafe { PdhCollectQueryData(self.query) == 0 }
    }

    /// Tutte le istanze di un contatore con caratteri jolly, con il loro nome.
    fn array(counter: isize) -> Vec<(String, f64)> {
        let mut size = 0u32;
        let mut count = 0u32;
        // SAFETY: prima chiamata solo per la dimensione del buffer (buffer nullo).
        let status = unsafe { PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, null_mut()) };
        if status != PDH_MORE_DATA || size == 0 {
            return Vec::new();
        }
        // Allineato come gli elementi (contengono un f64): il buffer ospita anche le stringhe dei nomi.
        let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
        let items = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
        // SAFETY: buffer di almeno `size` byte, come chiesto da PDH.
        if unsafe { PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, items) } != 0 {
            return Vec::new();
        }
        // SAFETY: PDH ha scritto `count` elementi all'inizio del buffer; i nomi puntano dentro il buffer stesso.
        let items = unsafe { std::slice::from_raw_parts(items, count as usize) };
        items
            .iter()
            .filter(|item| PDH_VALID.contains(&item.FmtValue.CStatus))
            .filter_map(|item| {
                if item.szName.is_null() {
                    return None;
                }
                // SAFETY: stringa terminata da 0 scritta da PDH nel buffer.
                let name = unsafe {
                    let len = (0..).take_while(|&i| *item.szName.add(i) != 0).count();
                    String::from_utf16_lossy(std::slice::from_raw_parts(item.szName, len))
                };
                // SAFETY: formato richiesto PDH_FMT_DOUBLE, quindi il campo valido dell'unione è doubleValue.
                Some((name, unsafe { item.FmtValue.Anonymous.doubleValue }))
            })
            .collect()
    }

    fn value(counter: isize) -> Option<f64> {
        // SAFETY: struttura di uscita azzerata e valida.
        let mut value: PDH_FMT_COUNTERVALUE = unsafe { zeroed() };
        let status = unsafe { PdhGetFormattedCounterValue(counter, PDH_FMT_DOUBLE, null_mut(), &mut value) };
        if status != 0 || !PDH_VALID.contains(&value.CStatus) {
            return None;
        }
        // SAFETY: formato PDH_FMT_DOUBLE.
        Some(unsafe { value.Anonymous.doubleValue })
    }
}

impl Drop for Pdh {
    fn drop(&mut self) {
        // SAFETY: chiude la query (e i suoi contatori) una volta sola.
        unsafe {
            PdhCloseQuery(self.query);
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------
// D3DKMT (schede video)
// ---------------------------------------------------------------------------------------------------------------

struct Adapter {
    handle: u32,
    luid: Luid,
    name: Option<String>,
    vram_total: Option<u64>,
}

fn query_adapter<T>(handle: u32, kind: KMTQUERYADAPTERINFOTYPE, data: &mut T) -> bool {
    let mut query = D3DKMT_QUERYADAPTERINFO {
        hAdapter: handle,
        Type: kind,
        pPrivateDriverData: data as *mut T as *mut c_void,
        PrivateDriverDataSize: size_of::<T>() as u32,
    };
    // SAFETY: `data` è valido per `size_of::<T>()` byte e del tipo che `kind` richiede.
    unsafe { D3DKMTQueryAdapterInfo(&mut query) >= 0 }
}

fn close_adapter(handle: u32) {
    // SAFETY: handle aperto da D3DKMTEnumAdapters2 e chiuso una volta sola.
    unsafe {
        D3DKMTCloseAdapter(&D3DKMT_CLOSEADAPTER { hAdapter: handle });
    }
}

/// Le schede video vere (anche integrate), senza il renderer software di Microsoft.
fn enum_adapters() -> Vec<Adapter> {
    let mut list = D3DKMT_ENUMADAPTERS2 { NumAdapters: 0, pAdapters: null_mut() };
    // SAFETY: con pAdapters nullo la chiamata scrive solo quante schede ci sono.
    if unsafe { D3DKMTEnumAdapters2(&mut list) } < 0 || list.NumAdapters == 0 {
        return Vec::new();
    }
    // SAFETY: D3DKMT_ADAPTERINFO è una struttura C senza invarianti: tutta a zero è valida.
    let mut infos: Vec<D3DKMT_ADAPTERINFO> = (0..list.NumAdapters).map(|_| unsafe { zeroed() }).collect();
    list.pAdapters = infos.as_mut_ptr();
    // SAFETY: buffer di NumAdapters elementi.
    if unsafe { D3DKMTEnumAdapters2(&mut list) } < 0 {
        return Vec::new();
    }
    infos.truncate(list.NumAdapters as usize);

    let mut adapters = Vec::new();
    for info in infos {
        let handle = info.hAdapter;
        // SAFETY: strutture C senza invarianti.
        let mut kind: D3DKMT_ADAPTERTYPE = unsafe { zeroed() };
        let flags = if query_adapter(handle, KMTQAITYPE_ADAPTERTYPE, &mut kind) {
            // SAFETY: l'unione ha un solo campo a 32 bit (i flag).
            unsafe { kind.Anonymous.Value }
        } else {
            0
        };
        if flags & ADAPTER_RENDER_SUPPORTED == 0 || flags & ADAPTER_SOFTWARE_DEVICE != 0 {
            close_adapter(handle);
            continue;
        }
        let mut registry: D3DKMT_ADAPTERREGISTRYINFO = unsafe { zeroed() };
        let name = query_adapter(handle, KMTQAITYPE_ADAPTERREGISTRYINFO, &mut registry)
            .then(|| from_wide(&registry.AdapterString))
            .filter(|n| !n.is_empty());
        let mut segments: D3DKMT_SEGMENTSIZEINFO = unsafe { zeroed() };
        let vram_total = query_adapter(handle, KMTQAITYPE_GETSEGMENTSIZE, &mut segments)
            .then_some(segments.DedicatedVideoMemorySize)
            .filter(|v| *v > 0);
        adapters.push(Adapter {
            handle,
            luid: Luid { high: info.AdapterLuid.HighPart, low: info.AdapterLuid.LowPart },
            name,
            vram_total,
        });
    }
    adapters
}

/// Valori "dal driver" di una scheda: ognuno c'è solo se il driver lo popola.
#[derive(Default)]
struct AdapterPerf {
    temperature_c: Option<f32>,
    power_percent: Option<f32>,
    fan_rpm: Option<u32>,
    memory_clock_mhz: Option<u64>,
    clock_mhz: Option<u64>,
}

fn adapter_perf(handle: u32) -> AdapterPerf {
    let mut perf = AdapterPerf::default();
    // SAFETY: strutture C senza invarianti; PhysicalAdapterIndex 0 = la scheda fisica (niente SLI/CrossFire).
    let mut data: D3DKMT_ADAPTER_PERFDATA = unsafe { zeroed() };
    if query_adapter(handle, KMTQAITYPE_ADAPTERPERFDATA, &mut data) {
        perf.temperature_c = units::deci_celsius(data.Temperature);
        perf.power_percent = units::deci_percent(data.Power);
        perf.fan_rpm = units::fan_rpm(data.FanRPM);
        perf.memory_clock_mhz = units::hz_to_mhz(data.MemoryFrequency);
    }
    // Il nodo 0 è il motore 3D: la sua frequenza è il "clock del core".
    let mut node: D3DKMT_NODE_PERFDATA = unsafe { zeroed() };
    if query_adapter(handle, KMTQAITYPE_NODEPERFDATA, &mut node) {
        perf.clock_mhz = units::hz_to_mhz(node.Frequency);
    }
    perf
}

// ---------------------------------------------------------------------------------------------------------------
// Dischi
// ---------------------------------------------------------------------------------------------------------------

/// Apre un dispositivo con accesso 0: basta per le IOCTL di sola informazione e non serve l'amministratore.
fn open_device(path: &str) -> Option<HANDLE> {
    let path = wide(path);
    // SAFETY: percorso terminato da 0; nessun attributo di sicurezza né modello.
    let handle = unsafe {
        CreateFileW(path.as_ptr(), 0, FILE_SHARE_READ | FILE_SHARE_WRITE, null(), OPEN_EXISTING, 0, null_mut())
    };
    (handle != INVALID_HANDLE_VALUE && !handle.is_null()).then_some(handle)
}

fn close(handle: HANDLE) {
    // SAFETY: handle aperto da open_device e chiuso una volta sola.
    unsafe {
        CloseHandle(handle);
    }
}

fn ioctl<I, O>(handle: HANDLE, code: u32, input: Option<&I>, output: &mut O) -> bool {
    let mut returned = 0u32;
    let (in_ptr, in_size) = match input {
        Some(i) => (i as *const I as *const c_void, size_of::<I>() as u32),
        None => (null(), 0),
    };
    // SAFETY: buffer di ingresso e uscita validi per le dimensioni passate; chiamata sincrona.
    unsafe { DeviceIoControl(handle, code, in_ptr, in_size, output as *mut O as *mut c_void, size_of::<O>() as u32, &mut returned, null_mut()) != 0 }
}

fn temperature_property(handle: HANDLE, property: STORAGE_PROPERTY_ID) -> Option<f32> {
    let query = STORAGE_PROPERTY_QUERY { PropertyId: property, QueryType: PropertyStandardQuery, AdditionalParameters: [0] };
    // SAFETY: struttura C senza invarianti.
    let mut out: STORAGE_TEMPERATURE_DATA_DESCRIPTOR = unsafe { zeroed() };
    if !ioctl(handle, IOCTL_STORAGE_QUERY_PROPERTY, Some(&query), &mut out) || out.InfoCount == 0 {
        return None;
    }
    units::disk_temp(out.TemperatureInfo[0].Temperature)
}

/// Temperatura di un disco fisico. Alcuni driver NVMe la danno solo come proprietà dell'adattatore.
fn disk_temperature(number: u32) -> Option<f32> {
    let handle = open_device(&format!(r"\\.\PhysicalDrive{number}"))?;
    let temp = temperature_property(handle, StorageDeviceTemperatureProperty)
        .or_else(|| temperature_property(handle, StorageAdapterTemperatureProperty));
    close(handle);
    temp
}

/// Numero del disco fisico che contiene un volume ("C:\" -> 0).
fn volume_disk_number(mount: &str) -> Option<u32> {
    let letter = mount.trim_end_matches('\\');
    if letter.len() != 2 || !letter.ends_with(':') {
        return None;
    }
    let handle = open_device(&format!(r"\\.\{letter}"))?;
    // SAFETY: struttura C senza invarianti.
    let mut number: STORAGE_DEVICE_NUMBER = unsafe { zeroed() };
    let ok = ioctl::<(), _>(handle, IOCTL_STORAGE_GET_DEVICE_NUMBER, None, &mut number);
    close(handle);
    ok.then_some(number.DeviceNumber)
}

// ---------------------------------------------------------------------------------------------------------------
// CPU
// ---------------------------------------------------------------------------------------------------------------

/// Frequenza base della CPU (MHz), quella che Gestione attività chiama "Velocità di base".
fn cpu_base_mhz() -> Option<u64> {
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    // SAFETY: strutture C senza invarianti, una per processore logico come chiede l'API.
    let mut infos: Vec<PROCESSOR_POWER_INFORMATION> = (0..threads).map(|_| unsafe { zeroed() }).collect();
    let size = (infos.len() * size_of::<PROCESSOR_POWER_INFORMATION>()) as u32;
    let status = unsafe { CallNtPowerInformation(ProcessorInformation, null(), 0, infos.as_mut_ptr() as *mut c_void, size) };
    if status < 0 {
        return None;
    }
    infos.iter().map(|i| i.MaxMhz as u64).max().filter(|m| *m > 0)
}

// ---------------------------------------------------------------------------------------------------------------
// Ciò che il campionatore comune usa
// ---------------------------------------------------------------------------------------------------------------

pub struct GpuReading {
    pub name: Option<String>,
    pub usage: Option<f32>,
    pub vram_used: Option<u64>,
    pub vram_total: Option<u64>,
    pub temperature_c: Option<f32>,
    pub power_percent: Option<f32>,
    pub fan_rpm: Option<u32>,
    pub clock_mhz: Option<u64>,
    pub memory_clock_mhz: Option<u64>,
}

#[derive(Default)]
pub struct Reading {
    pub gpus: Vec<GpuReading>,
    /// Utilizzo GPU per processo (PID -> %), come la colonna "GPU" di Gestione attività.
    pub gpu_by_process: HashMap<u32, f32>,
    pub cpu_frequency_mhz: Option<u64>,
}

pub struct WinSampler {
    pdh: Option<Pdh>,
    adapters: Vec<Adapter>,
    base_mhz: Option<u64>,
    /// Volume ("C:\") -> disco fisico, calcolato una volta per volume.
    volume_disks: HashMap<String, Option<u32>>,
}

impl WinSampler {
    pub fn new() -> Self {
        WinSampler { pdh: Pdh::new(), adapters: enum_adapters(), base_mhz: cpu_base_mhz(), volume_disks: HashMap::new() }
    }

    pub fn has_gpu(&self) -> bool {
        !self.adapters.is_empty()
    }

    pub fn read(&mut self) -> Reading {
        let mut reading = Reading::default();
        let mut by_adapter = HashMap::new();
        let mut vram_used: HashMap<Luid, u64> = HashMap::new();
        if let Some(pdh) = &self.pdh {
            if pdh.collect() {
                if let Some(counter) = pdh.gpu_engine {
                    let samples: Vec<_> = Pdh::array(counter)
                        .into_iter()
                        .filter_map(|(name, v)| units::parse_engine_instance(&name).map(|inst| (inst, v)))
                        .collect();
                    let util = units::aggregate_gpu_engines(&samples);
                    by_adapter = util.by_adapter;
                    reading.gpu_by_process = util.by_process;
                }
                if let Some(counter) = pdh.gpu_memory {
                    for (name, v) in Pdh::array(counter) {
                        if let Some(luid) = units::parse_adapter_instance(&name) {
                            if v.is_finite() && v >= 0.0 {
                                *vram_used.entry(luid).or_default() += v as u64;
                            }
                        }
                    }
                }
                if let (Some(counter), Some(base)) = (pdh.cpu_performance, self.base_mhz) {
                    reading.cpu_frequency_mhz = Pdh::value(counter).and_then(|p| units::cpu_frequency_mhz(base, p));
                }
            }
        }
        for adapter in &self.adapters {
            let perf = adapter_perf(adapter.handle);
            reading.gpus.push(GpuReading {
                name: adapter.name.clone(),
                usage: by_adapter.get(&adapter.luid).copied(),
                vram_used: vram_used.get(&adapter.luid).copied(),
                vram_total: adapter.vram_total,
                temperature_c: perf.temperature_c,
                power_percent: perf.power_percent,
                fan_rpm: perf.fan_rpm,
                clock_mhz: perf.clock_mhz,
                memory_clock_mhz: perf.memory_clock_mhz,
            });
        }
        reading
    }

    /// Temperatura del disco fisico che contiene il volume `mount`, se l'SSD la espone senza amministratore.
    pub fn volume_temperature(&mut self, mount: &str) -> Option<f32> {
        let number = *self.volume_disks.entry(mount.to_string()).or_insert_with(|| volume_disk_number(mount));
        number.filter(|n| *n < MAX_PHYSICAL_DRIVES).and_then(disk_temperature)
    }
}

impl Drop for WinSampler {
    fn drop(&mut self) {
        for adapter in &self.adapters {
            close_adapter(adapter.handle);
        }
    }
}
