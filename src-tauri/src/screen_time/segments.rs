//! Costruttore dei segmenti di Tempo al PC: logica pura, senza orologio né sistema (i campioni arrivano da fuori),
//! così si prova con `cargo test --lib screen_time`.
//!
//! Un segmento è un tratto continuo con la stessa app in primo piano (stesso processo e stesso titolo) e lo stesso
//! stato di attività. Si chiude quando:
//!  - cambia l'app o il titolo (il confine è il campione che vede il cambio);
//!  - l'inattività supera la soglia: il tratto "inattivo" comincia all'ultimo input, non quando ce ne accorgiamo;
//!  - tra due campioni passa troppo tempo (computer sospeso, processo fermato): il segmento finisce all'ultimo
//!    campione visto e il buco non si conta.

use std::collections::VecDeque;

use serde::Serialize;

use crate::companion::ForegroundInfo;

/// Oltre questo silenzio tra due campioni il computer era sospeso: il tempo in mezzo non si conta.
pub const GAP_MS: u64 = 10_000;
/// Segmenti chiusi tenuti in memoria se il frontend non li ritira (es. la pagina è bloccata): ~3 giorni di cambi
/// di finestra ogni 50 s. Oltre si buttano i più vecchi.
pub const MAX_CLOSED: usize = 5000;

/// Un campione: ora in millisecondi (Unix), secondi dall'ultimo input, app in primo piano.
#[derive(Clone, Debug)]
pub struct Sample {
    pub at_ms: u64,
    pub idle_seconds: Option<u64>,
    pub app: Option<ForegroundInfo>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub start_ms: u64,
    pub end_ms: u64,
    /// Percorso dell'eseguibile (su macOS il bundle .app); vuoto se non si legge (es. processi elevati).
    pub process: String,
    pub description: String,
    /// Titolo della finestra: serve al frontend per capire il sito, che lo butta subito (mai su disco).
    pub title: String,
    /// La finestra in primo piano era la dashboard.
    pub is_self: bool,
    /// Nessun input da più della soglia.
    pub idle: bool,
}

impl Segment {
    fn same_kind(&self, app: &Option<ForegroundInfo>, idle: bool) -> bool {
        let (process, description, title, is_self) = parts(app);
        self.idle == idle && self.process == process && self.title == title && self.description == description && self.is_self == is_self
    }
}

fn parts(app: &Option<ForegroundInfo>) -> (&str, &str, &str, bool) {
    match app {
        Some(a) => (&a.process, &a.description, &a.title, a.is_self),
        None => ("", "", "", false),
    }
}

fn open(app: &Option<ForegroundInfo>, idle: bool, start_ms: u64, end_ms: u64) -> Segment {
    let (process, description, title, is_self) = parts(app);
    Segment {
        start_ms,
        end_ms,
        process: process.to_string(),
        description: description.to_string(),
        title: title.to_string(),
        is_self,
        idle,
    }
}

pub struct Builder {
    idle_threshold_s: u64,
    current: Option<Segment>,
    closed: VecDeque<Segment>,
}

impl Builder {
    pub fn new(idle_threshold_s: u64) -> Self {
        Self { idle_threshold_s: idle_threshold_s.max(1), current: None, closed: VecDeque::new() }
    }

    pub fn set_idle_threshold(&mut self, seconds: u64) {
        self.idle_threshold_s = seconds.max(1);
    }

    fn close(&mut self, segment: Segment) {
        if segment.end_ms <= segment.start_ms {
            return;
        }
        if self.closed.len() >= MAX_CLOSED {
            self.closed.pop_front();
        }
        self.closed.push_back(segment);
    }

    pub fn push(&mut self, sample: Sample) {
        let now = sample.at_ms;
        let idle_s = sample.idle_seconds.unwrap_or(0);
        let idle = idle_s >= self.idle_threshold_s;

        let Some(mut current) = self.current.take() else {
            self.current = Some(open(&sample.app, idle, now, now));
            return;
        };

        // Orologio tornato indietro (cambio d'ora a mano): si riparte da qui.
        if now < current.end_ms {
            self.close(current);
            self.current = Some(open(&sample.app, idle, now, now));
            return;
        }

        // Computer sospeso: il segmento finisce all'ultimo campione, il buco non si conta.
        if now - current.end_ms > GAP_MS {
            self.close(current);
            self.current = Some(open(&sample.app, idle, now, now));
            return;
        }

        if current.same_kind(&sample.app, idle) {
            current.end_ms = now;
            self.current = Some(current);
            return;
        }

        // Si è appena diventati inattivi: il tratto inattivo comincia all'ultimo input.
        let boundary = if idle && !current.idle {
            now.saturating_sub(idle_s * 1000).clamp(current.start_ms, now)
        } else {
            now
        };
        current.end_ms = boundary;
        self.close(current);
        self.current = Some(open(&sample.app, idle, boundary, now));
    }

    /// Consegna i segmenti chiusi e il pezzo già trascorso di quello aperto, che riparte da qui: niente si conta due volte.
    pub fn take(&mut self) -> Vec<Segment> {
        let mut out: Vec<Segment> = self.closed.drain(..).collect();
        if let Some(current) = self.current.as_mut() {
            if current.end_ms > current.start_ms {
                out.push(current.clone());
                current.start_ms = current.end_ms;
            }
        }
        out
    }

    /// Chiude tutto (fine del conteggio): il segmento aperto finisce all'ultimo campione.
    pub fn finish(&mut self) -> Vec<Segment> {
        if let Some(current) = self.current.take() {
            self.close(current);
        }
        self.closed.drain(..).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(process: &str, title: &str) -> Option<ForegroundInfo> {
        Some(ForegroundInfo { process: process.into(), description: String::new(), title: title.into(), is_self: false })
    }

    fn s(at_s: u64, idle: u64, a: Option<ForegroundInfo>) -> Sample {
        Sample { at_ms: at_s * 1000, idle_seconds: Some(idle), app: a }
    }

    #[test]
    fn stessa_app_un_solo_segmento() {
        let mut b = Builder::new(180);
        for t in (0..=20).step_by(2) {
            b.push(s(t, 0, app("code.exe", "a")));
        }
        let out = b.take();
        assert_eq!(out.len(), 1);
        assert_eq!((out[0].start_ms, out[0].end_ms), (0, 20_000));
        assert!(!out[0].idle);
    }

    #[test]
    fn cambio_di_app_o_di_titolo_chiude() {
        let mut b = Builder::new(180);
        b.push(s(0, 0, app("code.exe", "a")));
        b.push(s(2, 0, app("code.exe", "a")));
        b.push(s(4, 0, app("chrome.exe", "YouTube")));
        b.push(s(6, 0, app("chrome.exe", "GitHub")));
        b.push(s(8, 0, app("chrome.exe", "GitHub")));
        let out = b.finish();
        let spans: Vec<_> = out.iter().map(|x| (x.title.as_str(), x.start_ms / 1000, x.end_ms / 1000)).collect();
        assert_eq!(spans, vec![("a", 0, 4), ("YouTube", 4, 6), ("GitHub", 6, 8)]);
    }

    #[test]
    fn inattivita_retrodatata_all_ultimo_input() {
        let mut b = Builder::new(180);
        let mut t = 0;
        while t <= 300 {
            // ultimo input a t = 100: da lì l'inattività cresce
            let idle = if t > 100 { t - 100 } else { 0 };
            b.push(s(t, idle, app("code.exe", "a")));
            t += 2;
        }
        let out = b.finish();
        assert_eq!(out.len(), 2);
        assert_eq!((out[0].start_ms / 1000, out[0].end_ms / 1000, out[0].idle), (0, 100, false));
        assert_eq!((out[1].start_ms / 1000, out[1].end_ms / 1000, out[1].idle), (100, 300, true));
    }

    #[test]
    fn sospensione_non_si_conta() {
        let mut b = Builder::new(180);
        b.push(s(0, 0, app("code.exe", "a")));
        b.push(s(2, 0, app("code.exe", "a")));
        b.push(s(3602, 0, app("code.exe", "a"))); // un'ora dopo
        b.push(s(3604, 0, app("code.exe", "a")));
        let out = b.finish();
        let spans: Vec<_> = out.iter().map(|x| (x.start_ms / 1000, x.end_ms / 1000)).collect();
        assert_eq!(spans, vec![(0, 2), (3602, 3604)]);
    }

    #[test]
    fn take_non_conta_due_volte() {
        let mut b = Builder::new(180);
        b.push(s(0, 0, app("code.exe", "a")));
        b.push(s(10, 0, app("code.exe", "a")));
        let first = b.take();
        b.push(s(20, 0, app("code.exe", "a")));
        let second = b.take();
        assert_eq!(b.take(), vec![]);
        let total: u64 = first.iter().chain(second.iter()).map(|x| x.end_ms - x.start_ms).sum();
        assert_eq!(total, 20_000);
        assert_eq!((second[0].start_ms, second[0].end_ms), (10_000, 20_000));
    }

    #[test]
    fn orologio_indietro_riparte() {
        let mut b = Builder::new(180);
        b.push(s(100, 0, app("code.exe", "a")));
        b.push(s(102, 0, app("code.exe", "a")));
        b.push(s(50, 0, app("code.exe", "a")));
        b.push(s(52, 0, app("code.exe", "a")));
        let total: u64 = b.finish().iter().map(|x| x.end_ms - x.start_ms).sum();
        assert_eq!(total, 4000);
    }

    #[test]
    fn buffer_limitato() {
        let mut b = Builder::new(180);
        for i in 0..(MAX_CLOSED as u64 + 50) {
            b.push(s(i * 2, 0, app("x.exe", &i.to_string())));
        }
        assert!(b.finish().len() <= MAX_CLOSED);
    }
}
