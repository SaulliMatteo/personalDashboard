//! Backend del widget Monitor di sistema (`src/widgets/sysmon/`).
//!
//! Un solo thread di campionamento, che gira SOLO mentre qualcuno è iscritto: il widget in dashboard e la pagina
//! di dettaglio si iscrivono con `sysmon_subscribe` (conteggio dei riferimenti), così insieme non avviano due
//! campionatori. A ogni intervallo il thread manda lo snapshot con l'evento `sysmon:snapshot`. La lista completa dei
//! processi e l'utilizzo per thread si calcolano solo con la pagina di dettaglio aperta (`detail`).
//! Niente viene salvato: lo storico dei grafici lo tiene il frontend in memoria.
//!
//! Solo Windows e macOS (Linux compila con la parte comune). Su Android/iOS i comandi esistono ma rispondono che il
//! monitor non c'è: il frontend lì non li chiama nemmeno.

// Sui sistemi mobili restano solo i comandi che rispondono "non disponibile".
#![cfg_attr(not(desktop), allow(dead_code))]

mod snapshot;
mod units;

#[cfg(desktop)]
mod sampler;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

use std::sync::{Arc, Condvar, Mutex};

use tauri::{AppHandle, Manager, State};

use snapshot::Capabilities;

/// Nome dell'evento con lo snapshot (anche in `sysmonApi.ts`).
const EVENT: &str = "sysmon:snapshot";
const DEFAULT_INTERVAL_MS: u64 = 2000;
const ALLOWED_INTERVALS_S: [u64; 3] = [1, 2, 5];

#[derive(Default)]
struct Inner {
    widget: u32,
    detail: u32,
    interval_ms: u64,
    /// Il thread di campionamento è vivo (lo rimette a false lui stesso uscendo).
    running: bool,
    /// Cambia a ogni iscrizione/disiscrizione/intervallo: sveglia il thread che sta aspettando.
    tick: u64,
    closing: bool,
    capabilities: Option<Capabilities>,
}

impl Inner {
    fn active(&self) -> bool {
        !self.closing && self.widget + self.detail > 0
    }
}

#[derive(Default)]
struct Shared {
    inner: Mutex<Inner>,
    wake: Condvar,
}

/// Stato del monitor, registrato in lib.rs con `.manage`.
#[derive(Default)]
pub struct SysmonState(Arc<Shared>);

fn lock(shared: &Shared) -> std::sync::MutexGuard<'_, Inner> {
    // Un thread finito nel panico non deve bloccare il monitor per sempre.
    shared.inner.lock().unwrap_or_else(|e| e.into_inner())
}

/// Chiamata alla chiusura della finestra e prima di installare un aggiornamento (vedi lib.rs e updater.rs):
/// il thread si ferma al prossimo risveglio, cioè subito.
pub fn shutdown(app: &AppHandle) {
    let shared = &app.state::<SysmonState>().0;
    let mut inner = lock(shared);
    inner.closing = true;
    inner.widget = 0;
    inner.detail = 0;
    inner.tick += 1;
    shared.wake.notify_all();
}

#[cfg(desktop)]
fn start_worker(app: AppHandle, shared: Arc<Shared>) {
    use std::time::{Duration, Instant};
    use tauri::Emitter;

    std::thread::Builder::new()
        .name("sysmon".into())
        .spawn(move || {
            let mut sampler = match sampler::Sampler::new() {
                Ok(s) => Some(s),
                Err(e) => {
                    log::warn!("monitor di sistema non avviato: {e}");
                    None
                }
            };
            // La prima misura dopo un attimo: CPU, processi e GPU sono differenze tra due letture.
            let mut next = Instant::now() + Duration::from_millis(500);
            loop {
                let (detail, interval_ms) = {
                    let mut inner = lock(&shared);
                    loop {
                        if !inner.active() || sampler.is_none() {
                            inner.running = false;
                            return;
                        }
                        let now = Instant::now();
                        if now >= next {
                            break;
                        }
                        let seen = inner.tick;
                        let (guard, _) = shared
                            .wake
                            .wait_timeout_while(inner, next - now, |i| i.tick == seen && i.active())
                            .unwrap_or_else(|e| e.into_inner());
                        inner = guard;
                        if inner.tick != seen {
                            // Cambio d'intervallo o pagina di dettaglio aperta: misura subito.
                            next = next.min(Instant::now() + Duration::from_millis(250));
                        }
                    }
                    (inner.detail > 0, inner.interval_ms)
                };
                if let Some(sampler) = sampler.as_mut() {
                    let snapshot = sampler.sample(detail, interval_ms);
                    let _ = app.emit(EVENT, &snapshot);
                }
                next = Instant::now() + Duration::from_millis(interval_ms);
            }
        })
        .map(|_| ())
        .unwrap_or_else(|e| log::warn!("thread del monitor di sistema non avviato: {e}"));
}

// ---------------------------------------------------------------------------------------------------------------
// Comandi
// ---------------------------------------------------------------------------------------------------------------

/// Cosa si riesce a leggere qui (calcolato una volta, con una misura vera). Async: non blocca la finestra.
#[tauri::command(async)]
pub fn sysmon_capabilities(state: State<'_, SysmonState>) -> Capabilities {
    #[cfg(desktop)]
    {
        if let Some(caps) = lock(&state.0).capabilities.clone() {
            return caps;
        }
        let caps = match sampler::Sampler::new() {
            Ok(mut s) => {
                // Utilizzi e GPU sono differenze tra due letture.
                std::thread::sleep(std::time::Duration::from_millis(300));
                s.capabilities()
            }
            Err(_) => Capabilities { platform: "unsupported", ..Default::default() },
        };
        lock(&state.0).capabilities = Some(caps.clone());
        caps
    }
    #[cfg(not(desktop))]
    {
        let _ = state;
        Capabilities { platform: "mobile", ..Default::default() }
    }
}

#[tauri::command]
pub fn sysmon_subscribe(app: AppHandle, state: State<'_, SysmonState>, detail: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let shared = state.0.clone();
        let mut inner = lock(&shared);
        if inner.closing {
            return Ok(());
        }
        if inner.interval_ms == 0 {
            inner.interval_ms = DEFAULT_INTERVAL_MS;
        }
        if detail {
            inner.detail += 1;
        } else {
            inner.widget += 1;
        }
        inner.tick += 1;
        shared.wake.notify_all();
        if !inner.running {
            inner.running = true;
            drop(inner);
            start_worker(app, shared);
        }
        Ok(())
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, state, detail);
        Err("Il monitor di sistema è disponibile solo nell'app desktop.".into())
    }
}

#[tauri::command]
pub fn sysmon_unsubscribe(state: State<'_, SysmonState>, detail: bool) {
    let mut inner = lock(&state.0);
    if detail {
        inner.detail = inner.detail.saturating_sub(1);
    } else {
        inner.widget = inner.widget.saturating_sub(1);
    }
    inner.tick += 1;
    state.0.wake.notify_all();
}

/// La pagina è stata (ri)caricata: le iscrizioni della pagina precedente non hanno più nessuno che le tolga.
#[tauri::command]
pub fn sysmon_reset(state: State<'_, SysmonState>) {
    let mut inner = lock(&state.0);
    inner.widget = 0;
    inner.detail = 0;
    inner.tick += 1;
    state.0.wake.notify_all();
}

#[tauri::command]
pub fn sysmon_set_interval(state: State<'_, SysmonState>, seconds: u64) -> Result<(), String> {
    if !ALLOWED_INTERVALS_S.contains(&seconds) {
        return Err(format!("Intervallo non valido: {seconds} s (ammessi 1, 2 o 5)."));
    }
    let mut inner = lock(&state.0);
    inner.interval_ms = seconds * 1000;
    inner.tick += 1;
    state.0.wake.notify_all();
    Ok(())
}
