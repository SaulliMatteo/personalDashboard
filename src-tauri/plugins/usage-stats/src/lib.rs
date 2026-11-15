//! Tempo allo schermo su Android: la cronologia di uso delle app che il sistema tiene per qualche giorno.
//!
//! La parte nativa (`android/src/main/java/UsageStatsPlugin.kt`) legge `UsageStatsManager` solo con il permesso
//! "Accesso ai dati di utilizzo" (lo accende l'utente nelle impostazioni di Android) e restituisce eventi compatti:
//! istante, tipo e app. Niente titoli né contenuti. Lo usa solo `src-tauri/src/screen_time/android.rs`: niente
//! comandi per il frontend.
#![cfg(target_os = "android")]

use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

const PLUGIN_IDENTIFIER: &str = "it.matteo.usagestats";

/// Errore senza dettagli: chi chiama mostra una frase fissa.
#[derive(Debug)]
pub struct Unavailable;

#[derive(Deserialize)]
struct StatusResponse {
    #[serde(default)]
    granted: bool,
}

#[derive(Serialize)]
struct NoArgs {}

#[derive(Serialize)]
struct RangeArgs {
    since: i64,
    until: i64,
}

/// Un'app vista negli eventi.
#[derive(Debug, Serialize, Deserialize)]
pub struct PackageInfo {
    pub pkg: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// `ApplicationInfo.category` (Android 8+); -1 = non definita.
    #[serde(default = "no_category")]
    pub category: i32,
}

fn no_category() -> i32 {
    -1
}

/// Eventi tra due istanti: `[ms, tipo, indice in packages, schermata]`, tipo 1 = in primo piano, 2 = in pausa,
/// 3 = schermo spento o bloccato (indici -1). La schermata è un numero per pacchetto + classe, senza il nome.
#[derive(Debug, Serialize, Deserialize)]
pub struct UsageEvents {
    pub events: Vec<(i64, u8, i32, i32)>,
    pub packages: Vec<PackageInfo>,
    /// Le app della schermata Home.
    #[serde(default)]
    pub home: Vec<String>,
    /// Il pacchetto della dashboard.
    #[serde(rename = "self", default)]
    pub self_package: String,
    /// Da quando Android ha ancora la cronologia (ms), se lo sa.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub oldest: Option<i64>,
}

pub struct UsageStats<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> UsageStats<R> {
    /// Il permesso "Accesso ai dati di utilizzo" c'è.
    pub fn granted(&self) -> Result<bool, Unavailable> {
        self.0
            .run_mobile_plugin::<StatusResponse>("status", NoArgs {})
            .map(|r| r.granted)
            .map_err(|_| Unavailable)
    }

    /// Apre la pagina di Android dove si accende il permesso.
    pub fn open_settings(&self) -> Result<(), Unavailable> {
        self.0
            .run_mobile_plugin::<IgnoredAny>("openAccessSettings", NoArgs {})
            .map(|_| ())
            .map_err(|_| Unavailable)
    }

    pub fn events(&self, since: i64, until: i64) -> Result<UsageEvents, Unavailable> {
        self.0
            .run_mobile_plugin::<UsageEvents>("events", RangeArgs { since, until })
            .map_err(|_| Unavailable)
    }
}

pub trait UsageStatsExt<R: Runtime> {
    fn usage_stats(&self) -> &UsageStats<R>;
}

impl<R: Runtime, T: Manager<R>> UsageStatsExt<R> for T {
    fn usage_stats(&self) -> &UsageStats<R> {
        self.state::<UsageStats<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("usage-stats")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "UsageStatsPlugin")?;
            app.manage(UsageStats(handle));
            Ok(())
        })
        .build()
}
