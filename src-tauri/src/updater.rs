//! Aggiornamenti dell'app (tauri-plugin-updater, frontend in src/core/updater/).
//!
//! Su Windows `install` avvia l'installer e chiude subito il processo con `std::process::exit`, senza
//! passare da `CloseRequested` né da `RunEvent::Exit` (vedi lib.rs): quello che va fermato alla chiusura si
//! ferma qui, chiamato dal frontend a download finito e prima di `install`. Su macOS il riavvio (`relaunch`)
//! passa invece da `RunEvent::Exit`, che fa la stessa pulizia.

use tauri::AppHandle;

use crate::{file_transfer, system_monitor};

/// Pulizia prima dell'installazione: il server di File Transfer (porta libera, upload a metà cancellati dal C)
/// e il campionatore del monitor di sistema. Si può chiamare più volte.
#[tauri::command]
pub fn updater_prepare_install(app: AppHandle) {
    file_transfer::shutdown(&app);
    system_monitor::shutdown(&app);
}
