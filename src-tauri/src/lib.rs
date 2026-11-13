mod app_tray;
mod companion;
mod db_backup;
mod file_open;
mod file_send;
mod file_transfer;
mod notify;
mod screen_time;
mod secure_store;
mod system_monitor;
mod updater;

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

/// Host del player di YouTube e di ciò che il player carica dentro di sé (accesso, pubblicità, immagini).
/// Su macOS wry passa a `on_navigation` anche le navigazioni degli iframe (su Windows e Android solo quelle
/// della pagina principale): senza questa eccezione l'iframe del player veniva annullato e aperto nel browser,
/// e la sonda nascosta delle durate (`widgets/youtube/lib/durationFill.ts`) apriva una scheda ogni pochi secondi.
/// Queste pagine non hanno accesso ai comandi (l'ACL ammette solo l'origine dell'app), e i click sui link della
/// pagina principale li apre nel browser il frontend (`core/system/externalLinks.ts`).
#[cfg(target_os = "macos")]
fn is_embed_url(url: &tauri::Url) -> bool {
    const HOSTS: [&str; 9] = [
        "youtube.com",
        "youtube-nocookie.com",
        "google.com",
        "googlevideo.com",
        "ytimg.com",
        "gstatic.com",
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
    ];
    if url.scheme() != "https" {
        return false;
    }
    let host = url.host_str().unwrap_or("");
    HOSTS
        .iter()
        .any(|h| host == *h || host.strip_suffix(*h).is_some_and(|rest| rest.ends_with('.')))
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
    // Sessione dei Gruppi su Android (src/secure_store.rs): il portachiavi è l'Android Keystore.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_secure_store::init());
    // Aprire e condividere i file del Quaderno su Android (src/file_open.rs).
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_file_open::init());
    // Aggiornamenti (Impostazioni > Generale, src/core/updater/): nessun controllo automatico, il plugin va
    // in rete solo quando il frontend chiama `check` (pulsante "Controlla aggiornamenti"). Process serve per
    // `relaunch` dopo l'installazione su macOS.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Avvio col computer (Impostazioni > Generale, src/app_tray.rs): parte nascosta, resta l'icona.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![app_tray::HIDDEN_ARG]),
        ));

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(file_transfer::FileTransferState::default())
        .manage(system_monitor::SysmonState::default())
        .manage(screen_time::ScreenTimeState::default())
        .manage(app_tray::TrayState::default())
        .invoke_handler(tauri::generate_handler![
            file_transfer::ft_start_server,
            file_transfer::ft_stop_server,
            file_transfer::ft_status,
            file_transfer::ft_list_files,
            file_transfer::ft_read_preview,
            file_transfer::ft_open_folder,
            file_send::ft_check_target,
            file_send::ft_send_file,
            companion::companion_snapshot,
            notify::notify_with_image,
            secure_store::secure_store_get,
            secure_store::secure_store_set,
            secure_store::secure_store_remove,
            file_open::file_open,
            file_open::file_share,
            db_backup::db_export_prepare,
            db_backup::db_export_save,
            db_backup::db_import_stage,
            db_backup::db_import_apply,
            updater::updater_prepare_install,
            system_monitor::sysmon_capabilities,
            system_monitor::sysmon_subscribe,
            system_monitor::sysmon_unsubscribe,
            system_monitor::sysmon_reset,
            system_monitor::sysmon_set_interval,
            screen_time::screentime_start,
            screen_time::screentime_take,
            screen_time::screentime_stop,
            app_tray::app_set_close_to_tray,
            app_tray::app_quit,
            app_tray::tray_set_today,
            app_tray::app_launch_at_startup,
            app_tray::app_set_launch_at_startup,
        ])
        .on_window_event(|window, event| {
            // Chiudendo la finestra il server C va fermato, altrimenti la
            // porta resta occupata fino alla morte del processo. Su Android
            // CloseRequested non arriva, ma lì il server C non c'è.
            // Si ferma anche il campionatore del monitor di sistema.
            // Con `closeToTray` acceso (src/app_tray.rs) la X nasconde soltanto: l'app resta vicino
            // all'orologio, il server e il conteggio di Tempo al PC continuano.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if app_tray::should_hide(app) {
                    api.prevent_close();
                    let _ = window.hide();
                    app_tray::hidden(app);
                    return;
                }
                file_transfer::shutdown(app);
                system_monitor::shutdown(app);
                screen_time::shutdown(app);
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
            // Avviata col computer: finestra nascosta, si apre dall'icona.
            #[cfg(desktop)]
            if app_tray::started_hidden() {
                config.visible = false;
            }
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
                    #[cfg(target_os = "macos")]
                    if is_embed_url(url) {
                        return true;
                    }
                    if matches!(url.scheme(), "http" | "https" | "mailto") {
                        use tauri_plugin_opener::OpenerExt;
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;
            #[cfg(desktop)]
            app_tray::create(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Uscita senza chiudere la finestra (es. il riavvio dopo un aggiornamento, `relaunch`):
            // stessa pulizia di CloseRequested. Su Windows l'installer chiude il processo senza
            // questo evento: lì la pulizia la fa `updater_prepare_install` (src/updater.rs).
            if let tauri::RunEvent::Exit = event {
                file_transfer::shutdown(app);
                system_monitor::shutdown(app);
                screen_time::shutdown(app);
            }
            // macOS: clic sull'icona nel Dock con la finestra nascosta.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                app_tray::show_main(app);
            }
        });
}
