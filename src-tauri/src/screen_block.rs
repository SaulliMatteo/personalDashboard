//! Blocco delle app al limite di Tempo allo schermo (solo Windows, docs/mockup/widget/tempo-blocco.html).
//!
//! La finestra principale dice quali app coprire (`screenblock_set`, a ogni salvataggio del conteggio, ~30 s, e
//! quando cambiano i limiti): limiti col blocco finiti e senza proroga in corso, già espansi nelle app (per una
//! categoria quelle che si conoscono). Un thread (`screenblock`) guarda ogni secondo l'app in primo piano e, se è
//! una di quelle, mette sopra di lei la finestra `blocco` (sempre in primo piano, senza bordi, sull'area di lavoro
//! del monitor di quell'app: la barra di Windows resta). Sta in Rust per lo stesso motivo del registratore: con la
//! finestra nascosta la WebView rallenta i timer a uno al minuto.
//!
//! Difese (docs/SICUREZZA.md):
//! - l'app non viene mai chiusa di forza: "Chiudi" manda `WM_CLOSE` (come la X) alle finestre del processo che il
//!   Rust ha coperto, non a un pid scelto dalla pagina; l'app può chiedere di salvare;
//! - mai coperte: la dashboard stessa e i pezzi di Windows (`NEVER_BLOCK`: Esplora file, Gestione attività, Start,
//!   schermata di blocco…);
//! - la finestra `blocco` carica solo l'app (`is_app_url`) e ha una capability sua con i soli comandi del blocco
//!   (`capabilities/blocco.json`): niente DB, file o rete;
//! - "Altri 15 minuti" una volta al giorno per limite lo controlla anche il Rust, non solo la pagina.
//!
//! Altrove (macOS, Linux, Android) i comandi esistono ma non fanno nulla.

#![cfg_attr(not(windows), allow(dead_code, unused_variables, unused_imports))]

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

/// Etichetta della finestra della schermata di blocco (anche in `capabilities/blocco.json`).
pub const WINDOW_LABEL: &str = "blocco";
/// "Altri 15 minuti".
const EXTENSION_MS: u64 = 15 * 60_000;
/// Dopo "Chiudi" l'app ha questo tempo per chiedere di salvare senza essere coperta di nuovo.
const CLOSE_GRACE_MS: u64 = 30_000;
const TICK_MS: u64 = 1000;
const MAX_TARGETS: usize = 500;
const MAX_TEXT: usize = 80;

/// Processi mai coperti, anche se un limite (es. sulla categoria "Altro") li prende: senza di loro non si potrebbe
/// usare Windows. Stessa forma di `processKey` (nome del file senza .exe, minuscolo).
const NEVER_BLOCK: [&str; 16] = [
    "explorer",
    "taskmgr",
    "lockapp",
    "logonui",
    "winlogon",
    "consent",
    "credentialuibroker",
    "searchhost",
    "searchapp",
    "startmenuexperiencehost",
    "shellexperiencehost",
    "shellhost",
    "applicationframehost",
    "systemsettings",
    "textinputhost",
    "dwm",
];

/// Un'app da coprire, come la manda la finestra principale (`BlockTarget` in widgets/screentime/lib/limits.ts).
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    key: String,
    app: String,
    limit_id: i64,
    label: String,
    kind: String,
    used_seconds: u64,
    max_seconds: u64,
    can_extend: bool,
}

/// Quello che la schermata di blocco mostra (`BlockShown` in widgets/screentime/data/screentimeApi.ts).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Shown {
    app: String,
    label: String,
    kind: String,
    used_seconds: u64,
    max_seconds: u64,
    can_extend: bool,
    theme: String,
    mode: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Extended {
    limit_id: i64,
    until: u64,
    day: String,
}

/// L'app coperta adesso.
#[derive(Clone, PartialEq)]
struct Covered {
    pid: u32,
    target: Target,
    /// Area di lavoro del monitor coperto (x, y, larghezza, altezza in pixel fisici).
    area: (i32, i32, u32, u32),
}

#[derive(Default)]
struct Inner {
    day: String,
    targets: HashMap<String, Target>,
    theme: String,
    mode: String,
    /// Proroghe di oggi: id del limite → fine (ms).
    extended: HashMap<i64, u64>,
    /// Processi appena chiusi con "Chiudi": pid → fine della tregua (ms).
    grace: HashMap<u32, u64>,
    covered: Option<Covered>,
    running: bool,
    stopping: bool,
}

/// Stato del blocco, registrato in lib.rs con `.manage`.
#[derive(Default)]
pub struct ScreenBlockState(Arc<Mutex<Inner>>);

fn lock(shared: &Mutex<Inner>) -> MutexGuard<'_, Inner> {
    shared.lock().unwrap_or_else(|e| e.into_inner())
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Nome dell'eseguibile senza .exe, minuscolo: la stessa regola di `processKey` (src/core/system/appCategory.ts).
fn process_key(path: &str) -> String {
    let base = path.rsplit(['\\', '/']).next().unwrap_or(path);
    let lower = base.to_lowercase();
    let stem = lower.strip_suffix(".exe").or_else(|| lower.strip_suffix(".app")).unwrap_or(&lower);
    stem.trim().to_string()
}

/// Testo da mostrare: senza caratteri di controllo e non troppo lungo.
fn clean_text(s: &str) -> String {
    s.chars().filter(|c| !c.is_control()).take(MAX_TEXT).collect::<String>().trim().to_string()
}

/// Tema o variante: solo lettere minuscole (il frontend controlla comunque che esistano).
fn clean_word(s: &str, fallback: &str) -> String {
    if !s.is_empty() && s.len() <= 16 && s.bytes().all(|b| b.is_ascii_lowercase()) {
        s.to_string()
    } else {
        fallback.to_string()
    }
}

/// Un bersaglio arrivato dalla pagina, controllato: `None` se non ha senso.
fn clean_target(t: Target) -> Option<Target> {
    let key = t.key.trim().to_lowercase();
    let key_ok = !key.is_empty() && key.chars().count() <= 128 && !key.chars().any(|c| c.is_control() || matches!(c, '\\' | '/' | ':'));
    if !key_ok || !matches!(t.kind.as_str(), "app" | "category") || NEVER_BLOCK.contains(&key.as_str()) {
        return None;
    }
    Some(Target { key, app: clean_text(&t.app), label: clean_text(&t.label), ..t })
}

/// Cosa fare a questo giro, deciso col lucchetto preso; le finestre si toccano dopo, a lucchetto lasciato (le
/// chiamate alle finestre aspettano il thread principale, che può essere in un comando che aspetta il lucchetto).
enum Action {
    Keep,
    Hide,
    Cover { hwnd: isize, pid: u32, target: Target },
    Exit,
}

/// La finestra principale chiede di coprire queste app (lista vuota = niente blocco).
#[tauri::command]
pub fn screenblock_set(app: AppHandle, state: State<'_, ScreenBlockState>, day: String, targets: Vec<Target>, theme: String, mode: String) {
    if !cfg!(windows) {
        return;
    }
    let shared = state.0.clone();
    let (start, changed) = {
        let mut inner = lock(&shared);
        if inner.day != day {
            inner.day = day;
            inner.extended.clear();
        }
        inner.theme = clean_word(&theme, "notte");
        inner.mode = clean_word(&mode, "notte");
        inner.targets = targets.into_iter().take(MAX_TARGETS).filter_map(clean_target).map(|t| (t.key.clone(), t)).collect();
        // L'app coperta ha numeri nuovi (minuti, proroga): la schermata li rilegge.
        let mut changed = false;
        if let Some(cov) = inner.covered.clone() {
            if let Some(t) = inner.targets.get(&cov.target.key).cloned() {
                if t != cov.target {
                    inner.covered = Some(Covered { target: t, ..cov });
                }
                changed = true;
            }
        }
        inner.stopping = false;
        let start = !inner.targets.is_empty() && !inner.running;
        if start {
            inner.running = true;
        }
        (start, changed)
    };
    if changed {
        let _ = app.emit_to(WINDOW_LABEL, "screenblock:changed", ());
    }
    if start {
        let for_thread = shared.clone();
        let handle = app.clone();
        let spawned = std::thread::Builder::new().name("screenblock".into()).spawn(move || run(handle, for_thread));
        if spawned.is_err() {
            lock(&shared).running = false;
        }
    }
}

/// Quello che la schermata deve mostrare adesso (null = niente).
#[tauri::command]
pub fn screenblock_current(state: State<'_, ScreenBlockState>) -> Option<Shown> {
    let inner = lock(&state.0);
    let cov = inner.covered.as_ref()?;
    let t = &cov.target;
    Some(Shown {
        app: t.app.clone(),
        label: t.label.clone(),
        kind: t.kind.clone(),
        used_seconds: t.used_seconds,
        max_seconds: t.max_seconds,
        can_extend: t.can_extend && !inner.extended.contains_key(&t.limit_id),
        theme: inner.theme.clone(),
        mode: inner.mode.clone(),
    })
}

/// "Chiudi …": `WM_CLOSE` alle finestre del processo coperto (deciso qui, non dalla pagina), come la X.
#[tauri::command]
pub fn screenblock_close_target(app: AppHandle, state: State<'_, ScreenBlockState>) {
    let pid = {
        let mut inner = lock(&state.0);
        let Some(cov) = inner.covered.take() else { return };
        inner.grace.insert(cov.pid, now_ms() + CLOSE_GRACE_MS);
        cov.pid
    };
    hide_window(&app);
    #[cfg(windows)]
    win::close_process_windows(pid);
}

/// "Altri 15 minuti": una volta al giorno per limite. La finestra principale lo salva (`screenblock:extended`).
#[tauri::command]
pub fn screenblock_extend(app: AppHandle, state: State<'_, ScreenBlockState>) -> bool {
    let payload = {
        let mut inner = lock(&state.0);
        let Some(cov) = inner.covered.clone() else { return false };
        let id = cov.target.limit_id;
        if !cov.target.can_extend || inner.extended.contains_key(&id) {
            return false;
        }
        let until = now_ms() + EXTENSION_MS;
        inner.extended.insert(id, until);
        inner.covered = None;
        Extended { limit_id: id, until, day: inner.day.clone() }
    };
    hide_window(&app);
    let _ = app.emit_to("main", "screenblock:extended", payload);
    true
}

/// "Apri la dashboard": la finestra principale sulla pagina di Tempo allo schermo. Davanti c'è la dashboard: il
/// giro dopo la schermata resta nascosta.
#[tauri::command]
pub fn screenblock_open_dashboard(app: AppHandle, state: State<'_, ScreenBlockState>) {
    lock(&state.0).covered = None;
    hide_window(&app);
    #[cfg(desktop)]
    crate::app_tray::show_main(&app);
    let _ = app.emit_to("main", "app:open-widget", "screentime");
}

fn hide_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(WINDOW_LABEL) {
        let _ = w.hide();
    }
}

/// Chiusura vera dell'app (lib.rs): il thread esce e la finestra di blocco si distrugge, altrimenti l'app
/// resterebbe aperta con una finestra nascosta.
pub fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<ScreenBlockState>() {
        let mut inner = lock(&state.0);
        inner.stopping = true;
        inner.covered = None;
    }
    if let Some(w) = app.get_webview_window(WINDOW_LABEL) {
        let _ = w.destroy();
    }
}

#[cfg(not(windows))]
fn run(_app: AppHandle, _shared: Arc<Mutex<Inner>>) {}

#[cfg(windows)]
fn run(app: AppHandle, shared: Arc<Mutex<Inner>>) {
    let main_hwnd = app.get_webview_window("main").and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize);
    let self_pid = std::process::id();
    // La schermata si prepara nascosta appena c'è qualcosa da bloccare: al primo blocco la pagina è già carica
    // (niente lampo bianco). Si crea da qui, non dal comando: sul thread principale potrebbe bloccarsi.
    if app.get_webview_window(WINDOW_LABEL).is_none() {
        if let Err(error) = create_window(&app) {
            log::error!("Schermata di blocco non creata: {error}");
        }
    }
    loop {
        std::thread::sleep(Duration::from_millis(TICK_MS));
        let fg = win::foreground();
        let action = {
            let mut inner = lock(&shared);
            let now = now_ms();
            inner.grace.retain(|_, until| *until > now);
            if inner.stopping || inner.targets.is_empty() {
                inner.running = false;
                inner.covered = None;
                Action::Exit
            } else {
                match &fg {
                    None => Action::Keep,
                    // La dashboard: la finestra principale nasconde la schermata, la schermata stessa resta.
                    Some(f) if f.pid == self_pid => {
                        if Some(f.hwnd) == main_hwnd {
                            Action::Hide
                        } else {
                            Action::Keep
                        }
                    }
                    Some(f) if NEVER_BLOCK.contains(&f.key.as_str()) || inner.grace.contains_key(&f.pid) => Action::Hide,
                    Some(f) => match inner.targets.get(&f.key) {
                        Some(t) if inner.extended.get(&t.limit_id).is_none_or(|until| *until <= now) => {
                            Action::Cover { hwnd: f.hwnd, pid: f.pid, target: t.clone() }
                        }
                        _ => Action::Hide,
                    },
                }
            }
        };
        match action {
            Action::Keep => {}
            Action::Hide => {
                let was = lock(&shared).covered.take().is_some();
                if was {
                    hide_window(&app);
                }
            }
            Action::Exit => {
                hide_window(&app);
                return;
            }
            Action::Cover { hwnd, pid, target } => cover(&app, &shared, hwnd, pid, target),
        }
    }
}

/// Mette la schermata sopra l'app: sull'area di lavoro del monitor della sua finestra, in primo piano.
#[cfg(windows)]
fn cover(app: &AppHandle, shared: &Arc<Mutex<Inner>>, hwnd: isize, pid: u32, target: Target) {
    let Some(area) = monitor_area(app, hwnd) else { return };
    let next = Covered { pid, target, area };
    let changed = {
        let mut inner = lock(shared);
        let changed = inner.covered.as_ref() != Some(&next);
        inner.covered = Some(next);
        changed
    };
    let window = match app.get_webview_window(WINDOW_LABEL) {
        Some(w) => w,
        None => match create_window(app) {
            Ok(w) => w,
            Err(error) => {
                log::error!("Schermata di blocco non creata: {error}");
                return;
            }
        },
    };
    if changed {
        let (x, y, w, h) = area;
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        let _ = window.set_size(tauri::PhysicalSize::new(w, h));
        let _ = app.emit_to(WINDOW_LABEL, "screenblock:changed", ());
    }
    let _ = window.set_always_on_top(true);
    let _ = window.show();
    let _ = window.set_focus();
}

/// Area di lavoro del monitor che contiene il centro della finestra (o il primo monitor).
#[cfg(windows)]
fn monitor_area(app: &AppHandle, hwnd: isize) -> Option<(i32, i32, u32, u32)> {
    let monitors = app.available_monitors().ok()?;
    let (cx, cy) = win::window_center(hwnd).unwrap_or((0, 0));
    let inside = |m: &&tauri::Monitor| {
        let p = m.position();
        let s = m.size();
        cx >= p.x && cy >= p.y && cx < p.x + s.width as i32 && cy < p.y + s.height as i32
    };
    let m = monitors.iter().find(inside).or_else(|| monitors.first())?;
    let wa = m.work_area();
    Some((wa.position.x, wa.position.y, wa.size.width, wa.size.height))
}

#[cfg(windows)]
fn create_window(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let window = tauri::WebviewWindowBuilder::new(app, WINDOW_LABEL, tauri::WebviewUrl::App("index.html?view=blocco".into()))
        .title("Tempo allo schermo")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .shadow(false)
        .visible(false)
        // Come la finestra principale: carica solo l'app, mai una pagina esterna (avrebbe i comandi del blocco).
        .on_navigation(crate::is_app_url)
        .build()?;
    Ok(window)
}

#[cfg(windows)]
mod win {
    use windows_sys::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, RECT};
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible, PostMessageW, WM_CLOSE,
    };

    pub struct Foreground {
        pub hwnd: isize,
        pub pid: u32,
        /// Come `processKey`; vuoto se il processo non si lascia leggere (es. elevato).
        pub key: String,
    }

    pub fn foreground() -> Option<Foreground> {
        // SAFETY: nessun argomento; può ritornare null (es. durante il cambio di finestra).
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        // SAFETY: hwnd viene da GetForegroundWindow, pid è un puntatore valido.
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if pid == 0 {
            return None;
        }
        let key = process_path(pid).map(|p| super::process_key(&p)).unwrap_or_default();
        Some(Foreground { hwnd: hwnd as isize, pid, key })
    }

    fn process_path(pid: u32) -> Option<String> {
        // SAFETY: OpenProcess con il diritto minimo; l'handle viene sempre chiuso sotto.
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return None;
        }
        let mut buf = vec![0u16; 1024];
        let mut size = buf.len() as u32;
        // SAFETY: handle aperto sopra, buffer e dimensione coerenti.
        let ok = unsafe { QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut size) };
        // SAFETY: handle valido, chiuso una sola volta.
        unsafe { CloseHandle(handle) };
        (ok != 0).then(|| String::from_utf16_lossy(&buf[..size as usize]))
    }

    pub fn window_center(hwnd: isize) -> Option<(i32, i32)> {
        let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        // SAFETY: hwnd è una finestra letta poco fa (se nel frattempo è sparita la chiamata fallisce e basta).
        let ok = unsafe { GetWindowRect(hwnd as HWND, &mut r) };
        (ok != 0).then(|| ((r.left + r.right) / 2, (r.top + r.bottom) / 2))
    }

    struct Search {
        pid: u32,
        found: Vec<isize>,
    }

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        // SAFETY: lparam è il puntatore a `Search` passato da close_process_windows, vivo per tutta EnumWindows.
        let search = unsafe { &mut *(lparam as *mut Search) };
        let mut pid: u32 = 0;
        // SAFETY: hwnd arriva da EnumWindows.
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        // SAFETY: hwnd arriva da EnumWindows.
        if pid == search.pid && unsafe { IsWindowVisible(hwnd) } != 0 {
            search.found.push(hwnd as isize);
        }
        1
    }

    /// Chiede di chiudersi a tutte le finestre visibili del processo (come la X): nessuna chiusura forzata.
    pub fn close_process_windows(pid: u32) {
        let mut search = Search { pid, found: Vec::new() };
        // SAFETY: la callback usa `search` solo durante la chiamata, che è sincrona.
        unsafe { EnumWindows(Some(collect), &mut search as *mut Search as LPARAM) };
        for hwnd in search.found {
            // SAFETY: PostMessageW non aspetta l'altra app; se la finestra non c'è più fallisce e basta.
            unsafe { PostMessageW(hwnd as HWND, WM_CLOSE, 0, 0) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(key: &str, kind: &str) -> Target {
        Target {
            key: key.into(),
            app: "Opera".into(),
            limit_id: 1,
            label: "Opera".into(),
            kind: kind.into(),
            used_seconds: 7200,
            max_seconds: 7200,
            can_extend: true,
        }
    }

    #[test]
    fn process_key_come_il_frontend() {
        assert_eq!(process_key(r"C:\Program Files\Opera\Opera.EXE"), "opera");
        assert_eq!(process_key(r"C:\x\Code.exe"), "code");
        assert_eq!(process_key("/Applications/Safari.app"), "safari");
    }

    #[test]
    fn bersagli_controllati() {
        assert!(clean_target(target("opera", "app")).is_some());
        assert_eq!(clean_target(target(" Opera ", "category")).map(|t| t.key), Some("opera".into()));
        assert!(clean_target(target("explorer", "category")).is_none());
        assert!(clean_target(target("..\\x", "app")).is_none());
        assert!(clean_target(target("c:x", "app")).is_none());
        assert!(clean_target(target("", "app")).is_none());
        assert!(clean_target(target("opera", "site")).is_none());
    }

    #[test]
    fn parole_del_tema() {
        assert_eq!(clean_word("vetro", "notte"), "vetro");
        assert_eq!(clean_word("Vetro", "notte"), "notte");
        assert_eq!(clean_word("x\" onload", "notte"), "notte");
    }
}
