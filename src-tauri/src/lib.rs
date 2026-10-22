mod companion;
mod file_transfer;

use tauri::Manager;

/// Porta da cui l'app installata su macOS serve il frontend (vedi `main_window_url`).
/// Non cambiarla: è l'origine della pagina, cambiarla azzera il `localStorage`.
/// Va tenuta uguale in `capabilities/default.json` (`remote.urls`).
#[cfg(all(target_os = "macos", not(dev)))]
const LOCALHOST_PORT: u16 = 14321;

/// URL della finestra principale. Su macOS l'app installata userebbe `tauri://localhost`:
/// da lì WKWebView non manda il referrer e YouTube rifiuta il player (errore 153),
/// quindi il frontend si serve da `http://localhost` con `tauri-plugin-localhost`.
/// Su Windows (`http://tauri.localhost`) e in dev (server di Vite) resta com'è.
#[cfg(all(target_os = "macos", not(dev)))]
fn main_window_url() -> tauri::WebviewUrl {
    let url = format!("http://localhost:{LOCALHOST_PORT}");
    tauri::WebviewUrl::External(url.parse().expect("URL localhost valido"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(all(target_os = "macos", not(dev)))]
    let builder = builder.plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build());

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
            // La finestra è in tauri.conf.json con `create: false`: si crea qui per
            // poterle cambiare l'URL su macOS (vedi `main_window_url`).
            #[allow(unused_mut)]
            let mut config = app.config().app.windows[0].clone();
            #[cfg(all(target_os = "macos", not(dev)))]
            {
                config.url = main_window_url();
            }
            tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
