//! Backend del widget File Transfer.
//!
//! Il server HTTP è scritto in C (src-tauri/filetransfer/c, compilato da
//! build.rs) e viene chiamato direttamente da qui. Rust si occupa solo di:
//! avviarlo/fermarlo, elencare i file ricevuti e produrre le anteprime.

use base64::Engine;
use serde::Serialize;
use std::io;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, State};

#[cfg(not(debug_assertions))]
use tauri::path::BaseDirectory;

#[cfg(target_os = "windows")]
extern "C" {
    fn http_server_start_with_dirs(
        port: i32,
        web_dir: *const std::ffi::c_char,
        upload_dir: *const std::ffi::c_char,
    ) -> i32;
    fn http_server_stop();
}

const PORT: u16 = 5000;
const TEXT_EXTENSIONS: &[&str] = &[
    "txt", "md", "json", "csv", "log", "c", "h", "js", "ts", "tsx", "jsx", "html", "css", "xml",
    "ini", "cfg", "yaml", "yml",
];
const IMAGE_EXTENSIONS: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("bmp", "image/bmp"),
    ("svg", "image/svg+xml"),
];
const MAX_TEXT_PREVIEW_BYTES: usize = 50_000;
const MAX_IMAGE_PREVIEW_BYTES: u64 = 12 * 1024 * 1024;

/// Stato del server visto dal frontend.
#[derive(Default, Clone, Serialize)]
pub struct ServerInfo {
    running: bool,
    /// "ip:porta" da aprire sull'iPad; None se il server è fermo.
    address: Option<String>,
}

#[derive(Default)]
pub struct FileTransferState(Mutex<ServerInfo>);

#[derive(Serialize)]
pub struct FileEntry {
    name: String,
    size: u64,
    modified: u64,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Preview {
    Text { content: String, truncated: bool },
    Image { mime: String, base64: String },
    Unsupported { extension: String, size: u64 },
}

// ---------------------------------------------------------------------
// Percorsi
// ---------------------------------------------------------------------

/// Cartella dei file ricevuti (nei dati dell'app, mai nella cartella di installazione).
fn received_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Impossibile ottenere la cartella dati dell'app: {e}"))?
        .join("file-transfer")
        .join("received");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Impossibile creare la cartella dei file ricevuti: {e}"))?;
    Ok(dir)
}

/// Cartella con la pagina web che l'iPad apre. In sviluppo è quella nei
/// sorgenti, nell'app installata è la risorsa inclusa nel bundle.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn web_dir(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    let dir = {
        let _ = app;
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("filetransfer").join("public")
    };

    #[cfg(not(debug_assertions))]
    let dir = app
        .path()
        .resolve("filetransfer-public", BaseDirectory::Resource)
        .map_err(|e| format!("Impossibile trovare le risorse web: {e}"))?;

    // Senza index.html il server partirebbe ma risponderebbe "pagina non
    // trovata" all'iPad: meglio fallire subito con un errore leggibile.
    if !dir.join("index.html").is_file() {
        return Err(format!("Pagina web di File Transfer non trovata in: {}", dir.display()));
    }
    Ok(dir)
}

/// Percorso -> stringa C. Tauri su Windows può dare percorsi "verbatim"
/// (\\?\C:\...), in cui '/' non viene convertito in '\': tolgo il prefisso.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn make_c_string(path: &PathBuf) -> Result<std::ffi::CString, String> {
    let s = path.to_string_lossy();
    let clean: &str = s.strip_prefix(r"\\?\").unwrap_or(s.as_ref());
    std::ffi::CString::new(clean.as_bytes()).map_err(|_| format!("Percorso non valido: {}", path.display()))
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn get_local_ip() -> io::Result<String> {
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.connect("8.8.8.8:80")?;
    Ok(socket.local_addr()?.ip().to_string())
}

fn stop_native() {
    #[cfg(target_os = "windows")]
    unsafe {
        http_server_stop();
    }
}

/// Chiamata alla chiusura della finestra (vedi lib.rs).
pub fn shutdown(app: &AppHandle) {
    let state = app.state::<FileTransferState>();
    if let Ok(mut info) = state.0.lock() {
        if info.running {
            stop_native();
            *info = ServerInfo::default();
        }
    };
}

// ---------------------------------------------------------------------
// Comandi
// ---------------------------------------------------------------------

#[tauri::command]
pub fn ft_start_server(app: AppHandle, state: State<FileTransferState>, port: Option<u16>) -> Result<String, String> {
    let port = port.unwrap_or(PORT);
    let mut info = state.0.lock().map_err(|e| e.to_string())?;

    if info.running {
        return Err("Il server è già in esecuzione.".into());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, port);
        return Err("Il server C integrato è supportato solo su Windows.".into());
    }

    #[cfg(target_os = "windows")]
    {
        let web_c = make_c_string(&web_dir(&app)?)?;
        let upload_c = make_c_string(&received_dir(&app)?)?;

        let result = unsafe { http_server_start_with_dirs(port as i32, web_c.as_ptr(), upload_c.as_ptr()) };
        if result != 0 {
            return Err(format!(
                "Impossibile avviare il server sulla porta {port}. La porta potrebbe essere già occupata."
            ));
        }

        let ip = get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string());
        let address = format!("{ip}:{port}");
        *info = ServerInfo { running: true, address: Some(address.clone()) };
        Ok(address)
    }
}

#[tauri::command]
pub fn ft_stop_server(state: State<FileTransferState>) -> Result<(), String> {
    let mut info = state.0.lock().map_err(|e| e.to_string())?;
    if info.running {
        stop_native();
        *info = ServerInfo::default();
    }
    Ok(())
}

#[tauri::command]
pub fn ft_status(state: State<FileTransferState>) -> Result<ServerInfo, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn ft_list_files(app: AppHandle) -> Result<Vec<FileEntry>, String> {
    let dir = received_dir(&app)?;
    let mut entries = Vec::new();

    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let metadata = match entry.metadata() {
            Ok(m) if m.is_file() => m,
            _ => continue,
        };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            size: metadata.len(),
            modified,
        });
    }

    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(entries)
}

#[tauri::command]
pub fn ft_read_preview(app: AppHandle, name: String) -> Result<Preview, String> {
    if name.is_empty() || name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Nome file non valido".into());
    }

    let path = received_dir(&app)?.join(&name);
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("Il percorso indicato non è un file".into());
    }

    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    if TEXT_EXTENSIONS.contains(&extension.as_str()) {
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let truncated = bytes.len() > MAX_TEXT_PREVIEW_BYTES;
        let content = String::from_utf8_lossy(&bytes[..bytes.len().min(MAX_TEXT_PREVIEW_BYTES)]).into_owned();
        return Ok(Preview::Text { content, truncated });
    }

    if let Some((_, mime)) = IMAGE_EXTENSIONS.iter().find(|(ext, _)| *ext == extension) {
        if metadata.len() > MAX_IMAGE_PREVIEW_BYTES {
            return Ok(Preview::Unsupported { extension, size: metadata.len() });
        }
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        return Ok(Preview::Image { mime: mime.to_string(), base64: encoded });
    }

    Ok(Preview::Unsupported { extension, size: metadata.len() })
}

#[tauri::command]
pub fn ft_open_folder(app: AppHandle) -> Result<(), String> {
    let dir = received_dir(&app)?;
    let path = dir.to_string_lossy().to_string();
    // Explorer non apre i percorsi con prefisso "verbatim".
    let path = path.strip_prefix(r"\\?\").unwrap_or(&path).to_string();

    #[cfg(target_os = "windows")]
    Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;

    Ok(())
}
