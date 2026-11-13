//! Icona vicino all'orologio (area di notifica su Windows, barra dei menu su macOS), chiusura che nasconde la
//! finestra, uscita con salvataggio e avvio col computer. Serve a Tempo al PC: il conteggio continua anche con la
//! finestra chiusa.
//!
//! - Chiudere la finestra la nasconde solo se il frontend ha acceso `closeToTray` (`app_set_close_to_tray`): finché
//!   non lo dice, la X chiude l'app come prima.
//! - "Esci" dal menu manda `app:quitting` al frontend, che salva l'ultimo pezzo di conteggio e chiama `app_quit`;
//!   se il frontend non risponde, dopo 2 s si esce comunque.
//! - Avvio col computer: `tauri-plugin-autostart` con l'argomento `--hidden`, che fa partire la finestra nascosta.
//!
//! Su Android niente di tutto questo: i comandi esistono e non fanno nulla.

#![cfg_attr(not(desktop), allow(dead_code, unused_imports))]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// Argomento con cui l'avvio automatico lancia l'app: finestra nascosta, resta solo l'icona.
pub const HIDDEN_ARG: &str = "--hidden";
/// Evento al frontend: l'utente ha scelto "Esci", salva e chiama `app_quit`.
const EVENT_QUITTING: &str = "app:quitting";
/// Evento al frontend: la finestra è stata nascosta chiudendola (per l'avviso della prima volta).
const EVENT_HIDDEN: &str = "app:hidden";
const QUIT_GRACE: Duration = Duration::from_secs(2);

#[derive(Default)]
pub struct TrayState {
    close_to_tray: AtomicBool,
    quitting: AtomicBool,
    #[cfg(desktop)]
    today: Mutex<Option<tauri::menu::MenuItem<tauri::Wry>>>,
    #[cfg(not(desktop))]
    today: Mutex<Option<()>>,
}

/// L'avvio automatico ha chiesto la finestra nascosta.
pub fn started_hidden() -> bool {
    std::env::args().any(|a| a == HIDDEN_ARG)
}

#[cfg(desktop)]
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Chiamata da `CloseRequested`: `true` se la finestra va nascosta invece di chiudere l'app.
pub fn should_hide<R: Runtime>(app: &AppHandle<R>) -> bool {
    let state = app.state::<TrayState>();
    cfg!(desktop) && state.close_to_tray.load(Ordering::Relaxed) && !state.quitting.load(Ordering::Relaxed)
}

pub fn hidden<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit(EVENT_HIDDEN, ());
}

fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<TrayState>();
    if state.quitting.swap(true, Ordering::Relaxed) {
        return;
    }
    if app.get_webview_window("main").is_none() || app.emit(EVENT_QUITTING, ()).is_err() {
        app.exit(0);
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(QUIT_GRACE);
        handle.exit(0);
    });
}

/// Crea l'icona e il suo menu. Solo desktop, chiamata in `setup`.
#[cfg(desktop)]
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let open = MenuItem::with_id(app, "open", "Apri la dashboard", true, None::<&str>)?;
    let today = MenuItem::with_id(app, "today", "Tempo al PC: —", false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Esci", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &today, &separator, &quit])?;
    *app.state::<TrayState>().today.lock().unwrap_or_else(|e| e.into_inner()) = Some(today);

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("personalDashboard")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => request_quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Il frontend dice se la X deve nascondere la finestra (impostazione `closeToTray`).
#[tauri::command]
pub fn app_set_close_to_tray(state: State<'_, TrayState>, enabled: bool) {
    state.close_to_tray.store(enabled, Ordering::Relaxed);
}

/// Uscita vera, dopo che il frontend ha salvato.
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.state::<TrayState>().quitting.store(true, Ordering::Relaxed);
    app.exit(0);
}

/// Testo della voce "Tempo al PC: 5 h 12 min" nel menu dell'icona.
#[tauri::command]
pub fn tray_set_today(state: State<'_, TrayState>, text: String) {
    #[cfg(desktop)]
    if let Some(item) = state.today.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        let text: String = text.chars().take(60).collect();
        let _ = item.set_text(text);
    }
    #[cfg(not(desktop))]
    let _ = (state, text);
}

/// Avvio col computer: stato reale (può averlo cambiato l'utente dal sistema).
#[tauri::command]
pub fn app_launch_at_startup(app: AppHandle) -> bool {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch().is_enabled().unwrap_or(false)
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        false
    }
}

#[tauri::command]
pub fn app_set_launch_at_startup(app: AppHandle, enabled: bool) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let manager = app.autolaunch();
        let result = if enabled { manager.enable() } else { manager.disable() };
        result.map_err(|e| e.to_string())?;
        Ok(manager.is_enabled().unwrap_or(enabled))
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, enabled);
        Err("Non disponibile su questo sistema".into())
    }
}
