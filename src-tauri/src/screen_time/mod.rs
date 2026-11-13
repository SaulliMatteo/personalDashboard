//! Registratore del widget Tempo al PC (`src/widgets/screentime/`).
//!
//! Un thread (`screentime`) campiona ogni 2 s l'app in primo piano e l'inattività (le stesse letture di Pixy,
//! `companion.rs`) e costruisce i segmenti (`segments.rs`). Sta in Rust perché con la finestra nascosta vicino
//! all'orologio la WebView rallenta i timer JavaScript fino a uno al minuto: il frontend ritira i segmenti quando
//! può (`screentime_take`), li classifica, butta il titolo e salva nel DB solo app, sito e secondi.
//! Niente di quello che passa di qui viene scritto su disco dal Rust.
//!
//! Solo Windows e macOS: altrove `screentime_start` risponde `false` e il thread non parte.

#![cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]

pub mod segments;

use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};

use segments::{Builder, Sample, Segment};

const SAMPLE_MS: u64 = 2000;
const DEFAULT_IDLE_S: u64 = 180;

struct Inner {
    builder: Builder,
    running: bool,
    /// Il thread deve fermarsi (stop o chiusura dell'app).
    stopping: bool,
}

impl Default for Inner {
    fn default() -> Self {
        Self { builder: Builder::new(DEFAULT_IDLE_S), running: false, stopping: false }
    }
}

#[derive(Default)]
struct Shared {
    inner: Mutex<Inner>,
    wake: Condvar,
}

/// Stato del registratore, registrato in lib.rs con `.manage`.
#[derive(Default)]
pub struct ScreenTimeState(Arc<Shared>);

fn lock(shared: &Shared) -> std::sync::MutexGuard<'_, Inner> {
    shared.inner.lock().unwrap_or_else(|e| e.into_inner())
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn sample() -> Sample {
    Sample { at_ms: now_ms(), idle_seconds: crate::companion::read_idle_seconds(), app: crate::companion::read_foreground() }
}

fn run(shared: Arc<Shared>) {
    loop {
        // La lettura del sistema avviene fuori dal lucchetto: `take` non deve aspettarla.
        let s = sample();
        let mut inner = lock(&shared);
        if inner.stopping {
            inner.running = false;
            return;
        }
        inner.builder.push(s);
        let (mut inner, _) = shared
            .wake
            .wait_timeout_while(inner, Duration::from_millis(SAMPLE_MS), |i| !i.stopping)
            .unwrap_or_else(|e| e.into_inner());
        if inner.stopping {
            inner.running = false;
            return;
        }
    }
}

/// Avvia il conteggio (o cambia la soglia di inattività se è già avviato). `false` dove non è supportato.
#[tauri::command]
pub fn screentime_start(state: State<'_, ScreenTimeState>, idle_seconds: u64) -> bool {
    if !crate::companion::signals_supported() {
        return false;
    }
    let shared = state.0.clone();
    let mut inner = lock(&shared);
    inner.builder.set_idle_threshold(idle_seconds);
    inner.stopping = false;
    if !inner.running {
        inner.running = true;
        let for_thread = shared.clone();
        let spawned = std::thread::Builder::new().name("screentime".into()).spawn(move || run(for_thread));
        if spawned.is_err() {
            inner.running = false;
            return false;
        }
    }
    true
}

/// Segmenti chiusi più il pezzo già trascorso di quello aperto. Ogni secondo si consegna una volta sola.
#[tauri::command]
pub fn screentime_take(state: State<'_, ScreenTimeState>) -> Vec<Segment> {
    lock(&state.0).builder.take()
}

/// Ferma il conteggio e consegna quello che restava.
#[tauri::command]
pub fn screentime_stop(state: State<'_, ScreenTimeState>) -> Vec<Segment> {
    stop(&state.0)
}

fn stop(shared: &Shared) -> Vec<Segment> {
    let mut inner = lock(shared);
    inner.stopping = true;
    shared.wake.notify_all();
    inner.builder.finish()
}

/// Chiusura dell'app o installazione di un aggiornamento (lib.rs, updater.rs): il thread esce subito.
pub fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<ScreenTimeState>() {
        let _ = stop(&state.0);
    }
}
