mod companion;
mod file_transfer;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(file_transfer::FileTransferState::default())
        .invoke_handler(tauri::generate_handler![
            file_transfer::ft_start_server,
            file_transfer::ft_stop_server,
            file_transfer::ft_status,
            file_transfer::ft_list_files,
            file_transfer::ft_read_preview,
            file_transfer::ft_open_folder,
            companion::companion_snapshot,
        ])
        .on_window_event(|window, event| {
            // Chiudendo la finestra il server C va fermato, altrimenti la
            // porta resta occupata fino alla morte del processo.
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                file_transfer::shutdown(window.app_handle());
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
