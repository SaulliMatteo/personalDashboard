//! File Transfer dalla parte di chi invia (oggi: Android, dove il server C non c'è).
//!
//! Il telefono manda i file al server del PC (src-tauri/filetransfer/c/http.c) come fa la pagina web
//! dell'iPad: `POST /upload` con `X-File-Name` e `Content-Length`. La richiesta parte da qui e non dalla
//! WebView, quindi non ha `Origin` e le difese del server restano quelle che sono. Il file si legge in
//! streaming anche da un URI `content://` del selettore di Android (plugin fs).

use serde::Serialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, SocketAddrV4, TcpStream};
use std::str::FromStr;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::AppHandle;
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

const DEFAULT_PORT: u16 = 5000;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(4);
/// Il server chiude dopo 30 s di silenzio: qui si aspetta un po' di più.
const IO_TIMEOUT: Duration = Duration::from_secs(40);
const CHUNK: usize = 64 * 1024;
/// Avanzamento al massimo ogni tanto, per non intasare il canale verso la pagina.
const PROGRESS_EVERY: Duration = Duration::from_millis(120);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendProgress {
    sent: u64,
    total: u64,
}

/// Solo "a.b.c.d" o "a.b.c.d:porta" di una rete locale: il server accetta come Host solo un IPv4 (difesa dal DNS
/// rebinding), e questo comando non deve diventare un modo per mandare file su internet scavalcando la CSP.
fn parse_target(address: &str) -> Result<SocketAddr, String> {
    let address = address.trim();
    let parsed = if address.contains(':') {
        SocketAddrV4::from_str(address).ok()
    } else {
        std::net::Ipv4Addr::from_str(address).ok().map(|ip| SocketAddrV4::new(ip, DEFAULT_PORT))
    };
    match parsed {
        Some(addr) if addr.ip().is_private() && addr.port() != 0 => Ok(SocketAddr::V4(addr)),
        Some(_) => Err("Serve un indirizzo della rete locale (es. 192.168.1.20:5000)".to_string()),
        None => Err("Indirizzo non valido: scrivi quello mostrato dal PC, es. 192.168.1.20:5000".to_string()),
    }
}

fn connect(target: &SocketAddr) -> Result<TcpStream, String> {
    let stream = TcpStream::connect_timeout(target, CONNECT_TIMEOUT)
        .map_err(|_| "PC non raggiungibile: controlla che il server sia acceso e sulla stessa rete Wi-Fi".to_string())?;
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));
    Ok(stream)
}

/// Il nome va nell'header codificato come `encodeURIComponent` nella pagina web (il server lo decodifica e lo
/// ripulisce): così un nome con a capo o caratteri strani non può aggiungere header.
fn encode_name(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for byte in name.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// Il PC risponde all'indirizzo? (solo la connessione, nessun dato inviato)
#[tauri::command]
pub async fn ft_check_target(address: String) -> Result<bool, String> {
    let target = parse_target(&address)?;
    tauri::async_runtime::spawn_blocking(move || Ok(connect(&target).is_ok()))
        .await
        .map_err(|e| e.to_string())?
}

/// Manda un file al PC. Restituisce il nome con cui il PC l'ha salvato (può aggiungere " (1)").
#[tauri::command]
pub async fn ft_send_file(
    app: AppHandle,
    address: String,
    path: String,
    name: String,
    on_progress: Channel<SendProgress>,
) -> Result<String, String> {
    let target = parse_target(&address)?;
    // solo file scelti dall'utente nel selettore di Android, mai un percorso dell'app (es. il database)
    if !path.starts_with("content://") {
        return Err("Scegli il file dal selettore".to_string());
    }
    let file_path = FilePath::from_str(&path).map_err(|e| e.to_string())?;
    let mut options = OpenOptions::new();
    options.read(true);
    let file = app.fs().open(file_path, options).map_err(|e| format!("Impossibile leggere il file: {e}"))?;

    tauri::async_runtime::spawn_blocking(move || send_blocking(target, file, &name, &on_progress))
        .await
        .map_err(|e| e.to_string())?
}

fn send_blocking(target: SocketAddr, mut file: std::fs::File, name: &str, progress: &Channel<SendProgress>) -> Result<String, String> {
    let total = file
        .metadata()
        .map(|m| m.len())
        .map_err(|_| "Dimensione del file sconosciuta".to_string())?;
    let mut stream = connect(&target)?;

    let head = format!(
        "POST /upload HTTP/1.1\r\nHost: {target}\r\nX-File-Name: {}\r\nContent-Type: application/octet-stream\r\nContent-Length: {total}\r\nConnection: close\r\n\r\n",
        encode_name(name)
    );
    let lost = |_| "Trasferimento interrotto".to_string();
    stream.write_all(head.as_bytes()).map_err(lost)?;

    let mut buf = vec![0u8; CHUNK];
    let mut sent = 0u64;
    let mut last = Instant::now();
    let _ = progress.send(SendProgress { sent, total });
    while sent < total {
        let n = file.read(&mut buf).map_err(|e| format!("Lettura del file non riuscita: {e}"))?;
        if n == 0 {
            return Err("Il file è cambiato durante l'invio".to_string());
        }
        stream.write_all(&buf[..n]).map_err(lost)?;
        sent += n as u64;
        if last.elapsed() >= PROGRESS_EVERY || sent == total {
            last = Instant::now();
            let _ = progress.send(SendProgress { sent, total });
        }
    }
    stream.flush().map_err(lost)?;

    // Risposta: "HTTP/1.1 200 OK", header, poi {"status":"ok","name":"…","size":…}
    let mut reader = BufReader::new(stream);
    let mut status = String::new();
    reader.read_line(&mut status).map_err(|_| "Il PC non ha risposto".to_string())?;
    let mut line = String::new();
    loop {
        line.clear();
        let n = reader.read_line(&mut line).map_err(|_| "Il PC non ha risposto".to_string())?;
        if n == 0 || line == "\r\n" || line == "\n" {
            break;
        }
    }
    let mut body = String::new();
    let _ = reader.take(4096).read_to_string(&mut body);

    let code = status.split_whitespace().nth(1).unwrap_or("");
    if code != "200" {
        let reason = body.trim();
        return Err(match code {
            "403" => "Il PC ha rifiutato l'invio".to_string(),
            "413" => "File troppo grande".to_string(),
            _ if !reason.is_empty() => format!("Errore dal PC: {reason}"),
            _ => format!("Errore dal PC ({})", status.trim()),
        });
    }
    let saved = serde_json::from_str::<serde_json::Value>(body.trim())
        .ok()
        .and_then(|v| v.get("name").and_then(|n| n.as_str()).map(str::to_string))
        .unwrap_or_else(|| name.to_string());
    Ok(saved)
}
