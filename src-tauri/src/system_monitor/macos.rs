//! macOS (Apple Silicon e Intel): sensori e GPU da sysinfo, senza privilegi.
//! - Temperature: su Apple Silicon IOHID ("PMU tdie*" per i core), sugli Intel l'SMC ("PECI CPU", "CPU Proximity").
//! - GPU: IOKit `IOAccelerator` > `PerformanceStatistics` > "Device Utilization %". Su Apple Silicon la memoria è
//!   unificata: niente VRAM, la UI scrive "memoria condivisa".
//!
//! NON verificato da Windows (qui non si compila): va provato su un Mac.

use sysinfo::{Components, Gpus};

use super::snapshot::Sensor;
use super::units;

pub struct GpuReading {
    pub name: Option<String>,
    pub usage: Option<f32>,
    pub shared_memory: bool,
}

pub struct MacSampler {
    components: Option<Components>,
    gpus: Option<Gpus>,
}

impl MacSampler {
    pub fn new() -> Self {
        MacSampler { components: Components::new_with_refreshed_list().ok(), gpus: Gpus::new_with_refreshed_list().ok() }
    }

    pub fn has_gpu(&self) -> bool {
        self.gpus.as_ref().is_some_and(|g| !g.is_empty())
    }

    /// Tutti i sensori di temperatura, già classificati.
    pub fn sensors(&mut self) -> Vec<Sensor> {
        let Some(components) = self.components.as_mut() else {
            return Vec::new();
        };
        components.refresh(true);
        components
            .iter()
            .map(|c| Sensor {
                label: c.label().to_string(),
                kind: units::sensor_kind(c.label()),
                temperature_c: c.temperature().and_then(units::plausible_temp),
            })
            .collect()
    }

    pub fn gpus(&mut self) -> Vec<GpuReading> {
        let Some(gpus) = self.gpus.as_mut() else {
            return Vec::new();
        };
        gpus.refresh(true);
        gpus.iter()
            .map(|g| {
                let name = g.model().map(str::to_string);
                // Le GPU Apple hanno la memoria unificata; quelle AMD dei Mac Intel hanno VRAM, che qui non si legge.
                let shared_memory = name.as_deref().is_some_and(|n| n.starts_with("Apple"));
                GpuReading { name, usage: g.usage().filter(|u| u.is_finite() && *u >= 0.0).map(|u| u.min(100.0)), shared_memory }
            })
            .collect()
    }
}
