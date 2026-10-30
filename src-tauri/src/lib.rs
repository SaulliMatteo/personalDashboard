mod companion;
mod file_transfer;
mod notify;
mod secure_store;

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

/// La finestra principale mostra solo l'app: `tauri://localhost` / `http://tauri.localhost` (app installata),
/// `http://localhost:14321` (macOS), il server di Vite in sviluppo. Qualsiasi altra pagina (es. un link in una
/// nota) non si carica qui, dove avrebbe accesso ai comandi dell'app, ma nel browser di sistema.
fn is_app_url(url: &tauri::Url) -> bool {
    let host = url.host_str().unwrap_or("");
    match url.scheme() {
        "tauri" => true,
        "http" | "https" if host == "tauri.localhost" => true,
        #[cfg(dev)]
        "http" if host == "localhost" || host == "127.0.0.1" => true,
        #[cfg(all(target_os = "macos", not(dev)))]
        "http" if host == "localhost" && url.port() == Some(LOCALHOST_PORT) => true,
        // pagine interne del motore (es. about:blank)
        "about" => true,
        _ => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Va registrato per primo. Il deep link del login (personaldashboard://auth/callback) su Windows e
    // Linux avvia una seconda istanza: questa inoltra l'URL al plugin deep-link dell'istanza aperta
    // (feature "deep-link") e si chiude. Qui si porta solo in primo piano la finestra: l'URL contiene il
    // codice di accesso e non va loggato.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    #[cfg(all(target_os = "macos", not(dev)))]
    let builder = builder.plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build());

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(file_transfer::FileTransferState::default())
        .invoke_handler(tauri::generate_handler![
            file_transfer::ft_start_server,
            file_transfer::ft_stop_server,
            file_transfer::ft_status,
            file_transfer::ft_list_files,
            file_transfer::ft_read_preview,
            file_transfer::ft_open_folder,
            companion::companion_snapshot,
            notify::notify_with_image,
            secure_store::secure_store_get,
            secure_store::secure_store_set,
            secure_store::secure_store_remove,
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
            // Schema personaldashboard:// (tauri.conf.json > plugins > deep-link): nell'app installata lo
            // registra l'installer; in sviluppo su Windows (e sempre su Linux) va registrato a runtime.
            // Su macOS funziona solo con l'app impacchettata.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            // La finestra è in tauri.conf.json con `create: false`: si crea qui per
            // poterle cambiare l'URL su macOS (vedi `main_window_url`).
            #[allow(unused_mut)]
            let mut config = app.config().app.windows[0].clone();
            #[cfg(all(target_os = "macos", not(dev)))]
            {
                config.url = main_window_url();
            }
            let handle = app.handle().clone();
            tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                .on_navigation(move |url| {
                    if is_app_url(url) {
                        return true;
                    }
                    if matches!(url.scheme(), "http" | "https" | "mailto") {
                        use tauri_plugin_opener::OpenerExt;
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
