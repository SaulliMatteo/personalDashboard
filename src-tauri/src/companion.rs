//! Segnali di sistema per il widget Companion.
//!
//! Un solo comando, `companion_snapshot`, chiamato dal frontend ogni ~2 s:
//!  - secondi dall'ultimo input di mouse/tastiera (di TUTTO il sistema, non
//!    solo della nostra finestra), per capire se l'utente è via;
//!  - processo, descrizione dell'eseguibile e titolo della finestra in primo
//!    piano, solo se il frontend lo chiede (impostazione "Osserva l'app in
//!    primo piano"). La descrizione (es. "Opera Internet Browser") aiuta a
//!    classificare anche le app che il frontend non conosce per nome.
//!
//! Niente viene salvato o inviato in rete: il frontend lo classifica in
//! categorie ("musica", "codice", …) e butta via il titolo.
//! Implementato solo per Windows; sugli altri sistemi ritorna campi vuoti
//! e il frontend ripiega sull'inattività della sola finestra.

use serde::Serialize;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundInfo {
    /// Percorso completo dell'eseguibile (es. "C:\\...\\Code.exe").
    pub process: String,
    /// "Descrizione file" dalle informazioni di versione dell'eseguibile (vuota se manca).
    pub description: String,
    pub title: String,
    /// La finestra in primo piano è la dashboard stessa.
    pub is_self: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CompanionSnapshot {
    /// None = non disponibile su questo sistema.
    pub idle_seconds: Option<u64>,
    pub foreground: Option<ForegroundInfo>,
    /// True se il sistema supporta questi segnali (oggi solo Windows).
    pub supported: bool,
}

#[tauri::command]
pub fn companion_snapshot(include_foreground: bool) -> CompanionSnapshot {
    platform::snapshot(include_foreground)
}

#[cfg(windows)]
mod platform {
    use super::{CompanionSnapshot, ForegroundInfo};
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    pub fn snapshot(include_foreground: bool) -> CompanionSnapshot {
        CompanionSnapshot {
            idle_seconds: idle_seconds(),
            foreground: if include_foreground { foreground() } else { None },
            supported: true,
        }
    }

    fn idle_seconds() -> Option<u64> {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        // SAFETY: `info` è una struttura valida con cbSize impostato, come richiede l'API.
        let ok = unsafe { GetLastInputInfo(&mut info) };
        if ok == 0 {
            return None;
        }
        // SAFETY: nessun argomento.
        let now = unsafe { GetTickCount() };
        // Entrambi i contatori sono a 32 bit e ripartono da zero dopo ~49 giorni:
        // la sottrazione con wrapping dà comunque la differenza giusta.
        Some((now.wrapping_sub(info.dwTime) / 1000) as u64)
    }

    fn foreground() -> Option<ForegroundInfo> {
        // SAFETY: nessun argomento; può ritornare null (es. durante il cambio di finestra).
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_null() {
            return None;
        }

        let mut pid: u32 = 0;
        // SAFETY: hwnd viene da GetForegroundWindow, pid è un puntatore valido.
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };

        // SAFETY: hwnd valido; il buffer ha la lunghezza dichiarata (+1 per il terminatore).
        let title = unsafe {
            let len = GetWindowTextLengthW(hwnd);
            if len > 0 {
                let mut buf = vec![0u16; len as usize + 1];
                let copied = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
                String::from_utf16_lossy(&buf[..copied.max(0) as usize])
            } else {
                String::new()
            }
        };

        let process = process_path(pid).unwrap_or_default();
        Some(ForegroundInfo {
            description: cached_description(&process),
            process,
            title,
            is_self: pid == std::process::id(),
        })
    }

    fn process_path(pid: u32) -> Option<String> {
        if pid == 0 {
            return None;
        }
        // SAFETY: OpenProcess con il diritto minimo; l'handle viene sempre chiuso sotto.
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            // Processi elevati (es. Task Manager) non si lasciano aprire: va bene così.
            return None;
        }
        let mut buf = vec![0u16; 1024];
        let mut size = buf.len() as u32;
        // SAFETY: handle aperto sopra, buffer e dimensione coerenti.
        let ok = unsafe { QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut size) };
        // SAFETY: handle valido, chiuso una sola volta.
        unsafe { CloseHandle(handle) };
        if ok == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..size as usize]))
    }

    /// La descrizione non cambia finché l'eseguibile è lo stesso: si legge
    /// una volta per percorso (il polling arriva ogni ~2 s).
    fn cached_description(path: &str) -> String {
        if path.is_empty() {
            return String::new();
        }
        static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
        let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Ok(map) = cache.lock() {
            if let Some(found) = map.get(path) {
                return found.clone();
            }
        }
        let description = file_description(path).unwrap_or_default();
        if let Ok(mut map) = cache.lock() {
            // Limite di sicurezza: in una sessione si aprono poche decine di programmi.
            if map.len() > 256 {
                map.clear();
            }
            map.insert(path.to_string(), description.clone());
        }
        description
    }

    fn file_description(path: &str) -> Option<String> {
        let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: `wide` è una stringa UTF-16 terminata da zero.
        let size = unsafe { GetFileVersionInfoSizeW(wide.as_ptr(), std::ptr::null_mut()) };
        if size == 0 {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        // SAFETY: il buffer ha esattamente la dimensione chiesta dall'API.
        let ok = unsafe { GetFileVersionInfoW(wide.as_ptr(), 0, size, data.as_mut_ptr().cast()) };
        if ok == 0 {
            return None;
        }

        // Lingua e codepage della prima traduzione (es. 0409 04B0).
        let mut ptr: *mut core::ffi::c_void = std::ptr::null_mut();
        let mut len: u32 = 0;
        let query: Vec<u16> = r"\VarFileInfo\Translation".encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: `data` contiene il blocco letto sopra; ptr/len sono puntatori validi.
        let ok = unsafe { VerQueryValueW(data.as_ptr().cast(), query.as_ptr(), &mut ptr, &mut len) };
        if ok == 0 || len < 4 || ptr.is_null() {
            return None;
        }
        // SAFETY: l'API garantisce almeno `len` byte validi dentro `data`: qui ne leggiamo 4.
        let (lang, codepage) = unsafe {
            let pair = ptr as *const u16;
            (std::ptr::read_unaligned(pair), std::ptr::read_unaligned(pair.add(1)))
        };

        let key = format!(r"\StringFileInfo\{lang:04x}{codepage:04x}\FileDescription");
        let query: Vec<u16> = key.encode_utf16().chain(std::iter::once(0)).collect();
        let mut ptr: *mut core::ffi::c_void = std::ptr::null_mut();
        let mut len: u32 = 0;
        // SAFETY: come sopra.
        let ok = unsafe { VerQueryValueW(data.as_ptr().cast(), query.as_ptr(), &mut ptr, &mut len) };
        if ok == 0 || len == 0 || ptr.is_null() {
            return None;
        }
        // SAFETY: `len` caratteri UTF-16 (terminatore compreso) dentro `data`.
        let chars = unsafe { std::slice::from_raw_parts(ptr as *const u16, len as usize) };
        let text = String::from_utf16_lossy(chars);
        let text = text.trim_end_matches('\0').trim();
        (!text.is_empty()).then(|| text.to_string())
    }
}

#[cfg(not(windows))]
mod platform {
    use super::CompanionSnapshot;

    // macOS/Linux: da implementare in futuro (CGEventSource / NSWorkspace).
    pub fn snapshot(_include_foreground: bool) -> CompanionSnapshot {
        CompanionSnapshot::default()
    }
}
