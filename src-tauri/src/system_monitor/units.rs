//! Conversioni di unità e regole "dato non disponibile -> None" del monitor di sistema.
//!
//! Tutto puro (niente API di sistema), così si prova con `cargo test`. La regola di fondo: un valore che la
//! macchina non sa dare diventa `None` (la UI mostra "—"), mai uno 0 o un numero inventato.

#![cfg_attr(not(desktop), allow(dead_code))]

use std::collections::HashMap;

/// Temperature plausibili per un sensore vero, in °C. Fuori da qui (0 dei driver che non popolano il campo,
/// valori di riempimento come 65535 decimi) il dato non c'è.
const MIN_TEMP_C: f32 = 1.0;
const MAX_TEMP_C: f32 = 150.0;

/// Una temperatura in °C, se è plausibile.
pub fn plausible_temp(celsius: f32) -> Option<f32> {
    (celsius.is_finite() && (MIN_TEMP_C..=MAX_TEMP_C).contains(&celsius)).then_some(celsius)
}

/// `D3DKMT_ADAPTER_PERFDATA.Temperature`: decimi di °C.
pub fn deci_celsius(raw: u32) -> Option<f32> {
    plausible_temp(raw as f32 / 10.0)
}

/// `D3DKMT_ADAPTER_PERFDATA.Power`: decimi di PERCENTUALE della potenza massima (non watt).
/// 0 vuol dire che il driver non lo popola: una scheda accesa consuma sempre qualcosa.
pub fn deci_percent(raw: u32) -> Option<f32> {
    let percent = raw as f32 / 10.0;
    (raw > 0 && percent <= 100.0).then_some(percent)
}

/// `D3DKMT_ADAPTER_PERFDATA.FanRPM`: giri al minuto. 0 è "non popolato" (o ventola ferma, che il driver non
/// distingue): meglio "—" che uno 0 che potrebbe essere falso.
pub fn fan_rpm(raw: u32) -> Option<u32> {
    (raw > 0 && raw < 30_000).then_some(raw)
}

/// Frequenze di D3DKMT (in Hz) -> MHz. 0 = non popolato.
pub fn hz_to_mhz(raw: u64) -> Option<u64> {
    (raw > 0).then_some(raw / 1_000_000)
}

/// Temperatura di un SSD da `STORAGE_TEMPERATURE_INFO.Temperature` (°C interi, con segno).
pub fn disk_temp(raw: i16) -> Option<f32> {
    plausible_temp(raw as f32)
}

/// Byte passati tra due giri -> byte al secondo.
pub fn per_second(bytes: u64, elapsed_ms: u64) -> Option<f64> {
    (elapsed_ms > 0).then(|| bytes as f64 * 1000.0 / elapsed_ms as f64)
}

/// Velocità di lettura/scrittura di un disco. sysinfo dà 0 anche quando non riesce a leggere i contatori
/// (su Windows servono i contatori del disco): se dall'avvio non risulta nemmeno un byte, il dato non c'è.
pub fn disk_rate(bytes_since_last: u64, total_since_boot: u64, elapsed_ms: u64) -> Option<f64> {
    if total_since_boot == 0 {
        return None;
    }
    per_second(bytes_since_last, elapsed_ms)
}

/// La % CPU di un processo come in Gestione attività: sysinfo la dà per core (un processo che occupa due thread
/// per intero vale 200%), qui diventa la quota di tutta la CPU.
pub fn process_cpu_percent(per_core: f32, threads: usize) -> Option<f32> {
    if !per_core.is_finite() || per_core < 0.0 || threads == 0 {
        return None;
    }
    Some((per_core / threads as f32).min(100.0))
}

/// Frequenza attuale su Windows come in Gestione attività: frequenza base × `% Processor Performance` / 100
/// (il contatore va oltre 100 col turbo).
pub fn cpu_frequency_mhz(base_mhz: u64, performance_percent: f64) -> Option<u64> {
    if base_mhz == 0 || !performance_percent.is_finite() || performance_percent <= 0.0 {
        return None;
    }
    Some((base_mhz as f64 * performance_percent / 100.0).round() as u64)
}

/// Una frequenza di sysinfo in MHz: 0 = non letta (succede su Apple Silicon).
pub fn nonzero_mhz(mhz: u64) -> Option<u64> {
    (mhz > 0).then_some(mhz)
}

/// LUID di una scheda video come compare nei nomi delle istanze PDH: `luid_0x00000000_0x0000D1C2`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Luid {
    pub high: i32,
    pub low: u32,
}

/// Un'istanza del contatore `\GPU Engine(*)\Utilization Percentage`, es.
/// `pid_1234_luid_0x00000000_0x0000D1C2_phys_0_eng_0_engtype_3D`.
#[derive(Debug, PartialEq)]
pub struct EngineInstance {
    pub pid: u32,
    pub luid: Luid,
    /// Il motore (`phys_0_eng_3`): ogni motore è un "processore" a sé, con il suo 0-100%.
    pub engine: String,
    /// Il tipo (`3D`, `Copy`, `VideoDecode`…): Gestione attività raggruppa per tipo.
    pub engine_type: String,
}

fn parse_luid(high_hex: &str, low_hex: &str) -> Option<Luid> {
    let high = u32::from_str_radix(high_hex.strip_prefix("0x")?, 16).ok()? as i32;
    let low = u32::from_str_radix(low_hex.strip_prefix("0x")?, 16).ok()?;
    Some(Luid { high, low })
}

/// Legge il nome di un'istanza di `GPU Engine`. None se non ha la forma attesa.
pub fn parse_engine_instance(name: &str) -> Option<EngineInstance> {
    let parts: Vec<&str> = name.split('_').collect();
    let at = |key: &str| parts.iter().position(|p| *p == key);
    let pid = parts.get(at("pid")? + 1)?.parse().ok()?;
    let luid_at = at("luid")?;
    let luid = parse_luid(parts.get(luid_at + 1)?, parts.get(luid_at + 2)?)?;
    let phys = parts.get(at("phys")? + 1)?;
    let eng = parts.get(at("eng")? + 1)?;
    // Il tipo può contenere "_" (raro, ma i nomi li sceglie il driver): è tutto ciò che segue "engtype".
    let engine_type = parts.get(at("engtype")? + 1..)?.join("_");
    if engine_type.is_empty() {
        return None;
    }
    Some(EngineInstance { pid, luid, engine: format!("{phys}_{eng}"), engine_type })
}

/// Legge il nome di un'istanza di `GPU Adapter Memory`, es. `luid_0x00000000_0x0000D1C2_phys_0`.
pub fn parse_adapter_instance(name: &str) -> Option<Luid> {
    let parts: Vec<&str> = name.split('_').collect();
    let at = parts.iter().position(|p| *p == "luid")?;
    parse_luid(parts.get(at + 1)?, parts.get(at + 2)?)
}

/// Utilizzo della GPU calcolato come in Gestione attività.
#[derive(Debug, Default, PartialEq)]
pub struct GpuUtilization {
    /// Per scheda: per ogni motore la somma dei processi, poi il motore più occupato.
    pub by_adapter: HashMap<Luid, f32>,
    /// Per processo: il motore che quel processo occupa di più (su tutte le schede).
    pub by_process: HashMap<u32, f32>,
}

/// Aggrega i valori di `GPU Engine(*)\Utilization Percentage`. Sommare tutto (come fa sysinfo) darebbe più del
/// 100% quando lavorano più motori insieme (es. 3D e decodifica video).
pub fn aggregate_gpu_engines(samples: &[(EngineInstance, f64)]) -> GpuUtilization {
    let mut per_engine: HashMap<(Luid, &str), f64> = HashMap::new();
    let mut per_process_engine: HashMap<(u32, Luid, &str), f64> = HashMap::new();
    for (inst, value) in samples {
        if !value.is_finite() || *value < 0.0 {
            continue;
        }
        *per_engine.entry((inst.luid, inst.engine.as_str())).or_default() += value;
        *per_process_engine.entry((inst.pid, inst.luid, inst.engine.as_str())).or_default() += value;
    }
    let mut out = GpuUtilization::default();
    for ((luid, _), sum) in per_engine {
        let v = out.by_adapter.entry(luid).or_default();
        *v = v.max(sum.min(100.0) as f32);
    }
    for ((pid, _, _), sum) in per_process_engine {
        // pid 0 sono i motori senza processo (il sistema): contano per la scheda, non in tabella.
        if pid == 0 {
            continue;
        }
        let v = out.by_process.entry(pid).or_default();
        *v = v.max(sum.min(100.0) as f32);
    }
    out
}

/// Temperatura della CPU sui Mac, dai sensori che sysinfo elenca: su Apple Silicon i "PMU tdie*" (die dei core,
/// letti via IOHID), sugli Intel "PECI CPU" o "CPU Proximity" (SMC). Il più caldo, come fanno le app di sistema.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn pick_cpu_temp<'a>(sensors: impl IntoIterator<Item = (&'a str, f32)>) -> Option<f32> {
    sensors
        .into_iter()
        .filter(|(label, _)| is_cpu_sensor(label))
        .filter_map(|(_, t)| plausible_temp(t))
        .reduce(f32::max)
}

/// Se l'etichetta di un sensore di sysinfo è un sensore della CPU.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn is_cpu_sensor(label: &str) -> bool {
    let l = label.to_ascii_lowercase();
    l.contains("tdie") || l.contains("peci cpu") || l.contains("cpu proximity") || l.contains("cpu die")
}

/// Il tipo di un sensore dei Mac dalla sua etichetta (per raggrupparli nella pagina e nella metrica Temperature).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn sensor_kind(label: &str) -> &'static str {
    let l = label.to_ascii_lowercase();
    if is_cpu_sensor(label) {
        "cpu"
    } else if l.contains("gpu") {
        "gpu"
    } else if l.contains("battery") || l.contains("gas gauge") {
        "battery"
    } else if l.contains("nand") || l.contains("ssd") || l.contains("disk") {
        "disk"
    } else {
        "other"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tipi_dei_sensori() {
        assert_eq!(sensor_kind("PMU tdie3"), "cpu");
        assert_eq!(sensor_kind("GPU"), "gpu");
        assert_eq!(sensor_kind("gas gauge battery"), "battery");
        assert_eq!(sensor_kind("NAND CH0 temp"), "disk");
        assert_eq!(sensor_kind("PMU tcal"), "other");
    }

    #[test]
    fn temperature_in_decimi() {
        assert_eq!(deci_celsius(473), Some(47.3));
        assert_eq!(deci_celsius(0), None, "0 = il driver non popola il campo");
        assert_eq!(deci_celsius(65_535), None, "valore di riempimento");
    }

    #[test]
    fn consumo_in_decimi_di_percentuale_non_watt() {
        assert_eq!(deci_percent(245), Some(24.5));
        assert_eq!(deci_percent(1000), Some(100.0));
        assert_eq!(deci_percent(0), None);
        assert_eq!(deci_percent(1001), None, "oltre il 100% non è un dato vero");
    }

    #[test]
    fn ventola_e_frequenze() {
        assert_eq!(fan_rpm(1450), Some(1450));
        assert_eq!(fan_rpm(0), None);
        assert_eq!(hz_to_mhz(1_200_000_000), Some(1200));
        assert_eq!(hz_to_mhz(0), None);
        assert_eq!(nonzero_mhz(0), None);
        assert_eq!(nonzero_mhz(3900), Some(3900));
    }

    #[test]
    fn temperature_dei_dischi() {
        assert_eq!(disk_temp(71), Some(71.0));
        assert_eq!(disk_temp(0), None);
        assert_eq!(disk_temp(-5), None);
        assert_eq!(disk_temp(200), None);
    }

    #[test]
    fn velocita_al_secondo() {
        assert_eq!(per_second(4_000_000, 2000), Some(2_000_000.0));
        assert_eq!(per_second(10, 0), None);
        assert_eq!(disk_rate(0, 0, 2000), None, "nessun byte dall'avvio = contatori non disponibili");
        assert_eq!(disk_rate(0, 5_000, 2000), Some(0.0), "disco fermo, ma i contatori ci sono");
    }

    #[test]
    fn cpu_dei_processi_come_gestione_attivita() {
        assert_eq!(process_cpu_percent(200.0, 16), Some(12.5));
        assert_eq!(process_cpu_percent(1800.0, 16), Some(100.0));
        assert_eq!(process_cpu_percent(10.0, 0), None);
        assert_eq!(process_cpu_percent(f32::NAN, 8), None);
    }

    #[test]
    fn frequenza_da_base_e_performance() {
        assert_eq!(cpu_frequency_mhz(3000, 130.0), Some(3900));
        assert_eq!(cpu_frequency_mhz(0, 100.0), None);
        assert_eq!(cpu_frequency_mhz(3000, 0.0), None);
    }

    #[test]
    fn nomi_delle_istanze_pdh() {
        let inst = parse_engine_instance("pid_1234_luid_0x00000000_0x0000D1C2_phys_0_eng_3_engtype_VideoDecode").unwrap();
        assert_eq!(inst.pid, 1234);
        assert_eq!(inst.luid, Luid { high: 0, low: 0xD1C2 });
        assert_eq!(inst.engine, "0_3");
        assert_eq!(inst.engine_type, "VideoDecode");
        assert_eq!(parse_engine_instance("_Total"), None);
        assert_eq!(parse_engine_instance("pid_x_luid_0x0_0x1_phys_0_eng_0_engtype_3D"), None);
        assert_eq!(parse_adapter_instance("luid_0x00000001_0x0000ABCD_phys_0"), Some(Luid { high: 1, low: 0xABCD }));
        assert_eq!(parse_adapter_instance("qualcosa"), None);
    }

    #[test]
    fn aggregazione_come_gestione_attivita() {
        let s = |pid, eng: &str, ty: &str, v| {
            let name = format!("pid_{pid}_luid_0x00000000_0x00000001_phys_0_eng_{eng}_engtype_{ty}");
            (parse_engine_instance(&name).unwrap(), v)
        };
        let util = aggregate_gpu_engines(&[
            s(10, "0", "3D", 30.0),
            s(20, "0", "3D", 25.0),
            s(10, "5", "VideoDecode", 40.0),
            s(0, "0", "3D", 5.0),
        ]);
        let luid = Luid { high: 0, low: 1 };
        // Motore 3D: 30 + 25 + 5 = 60; decodifica: 40. La scheda vale il motore più occupato, non 100.
        assert_eq!(util.by_adapter.get(&luid), Some(&60.0));
        // Il processo 10 usa il 3D al 30% e la decodifica al 40%: vale 40.
        assert_eq!(util.by_process.get(&10), Some(&40.0));
        assert_eq!(util.by_process.get(&20), Some(&25.0));
        assert_eq!(util.by_process.get(&0), None);
    }

    #[test]
    fn mai_oltre_il_cento() {
        let name = "pid_1_luid_0x00000000_0x00000001_phys_0_eng_0_engtype_3D";
        let a = (parse_engine_instance(name).unwrap(), 80.0);
        let b = (parse_engine_instance(&name.replace("pid_1", "pid_2")).unwrap(), 70.0);
        let util = aggregate_gpu_engines(&[a, b]);
        assert_eq!(util.by_adapter.values().next(), Some(&100.0));
    }

    #[test]
    fn temperatura_cpu_sul_mac() {
        let apple = [("PMU tdie1", 48.0), ("PMU tdie2", 52.5), ("gas gauge battery", 31.0), ("NAND CH0 temp", 40.0)];
        assert_eq!(pick_cpu_temp(apple.iter().map(|(l, t)| (*l, *t))), Some(52.5));
        let intel = [("CPU Proximity", 55.0), ("GPU", 50.0), ("Battery", 30.0)];
        assert_eq!(pick_cpu_temp(intel.iter().map(|(l, t)| (*l, *t))), Some(55.0));
        let none = [("gas gauge battery", 31.0), ("PMU tdie1", 0.0)];
        assert_eq!(pick_cpu_temp(none.iter().map(|(l, t)| (*l, *t))), None);
    }
}
