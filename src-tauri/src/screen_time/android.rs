//! Tempo allo schermo sul telefono, tramite il plugin `plugins/usage-stats`: permesso "Accesso ai dati di utilizzo",
//! la pagina di Android dove si accende e gli eventi di uso delle app. Sul telefono non c'è un registratore: il
//! frontend legge la cronologia di Android quando l'app è aperta (`src/widgets/screentime/data/phoneUsage.ts`), la
//! trasforma in segmenti e salva solo app, categoria e secondi.
//! Sugli altri sistemi i comandi rispondono "non c'è" (false o errore).

#[tauri::command]
pub async fn screentime_usage_access(app: tauri::AppHandle) -> bool {
    imp::access(&app)
}

#[tauri::command]
pub async fn screentime_usage_open_settings(app: tauri::AppHandle) -> Result<(), String> {
    imp::open_settings(&app)
}

/// Eventi tra `since` e `until` (ms): vedi `UsageEvents` del plugin.
#[tauri::command]
pub async fn screentime_usage_events(app: tauri::AppHandle, since: i64, until: i64) -> Result<serde_json::Value, String> {
    imp::events(&app, since, until)
}

#[cfg(target_os = "android")]
mod imp {
    use tauri_plugin_usage_stats::UsageStatsExt;

    const ERR: &str = "Cronologia delle app non disponibile";

    pub fn access(app: &tauri::AppHandle) -> bool {
        app.usage_stats().granted().unwrap_or(false)
    }

    pub fn open_settings(app: &tauri::AppHandle) -> Result<(), String> {
        app.usage_stats().open_settings().map_err(|_| ERR.to_string())
    }

    pub fn events(app: &tauri::AppHandle, since: i64, until: i64) -> Result<serde_json::Value, String> {
        let events = app.usage_stats().events(since, until).map_err(|_| ERR.to_string())?;
        serde_json::to_value(events).map_err(|_| ERR.to_string())
    }
}

#[cfg(not(target_os = "android"))]
mod imp {
    const ERR: &str = "Non disponibile su questo sistema";

    pub fn access(_app: &tauri::AppHandle) -> bool {
        false
    }

    pub fn open_settings(_app: &tauri::AppHandle) -> Result<(), String> {
        Err(ERR.into())
    }

    pub fn events(_app: &tauri::AppHandle, _since: i64, _until: i64) -> Result<serde_json::Value, String> {
        Err(ERR.into())
    }
}
