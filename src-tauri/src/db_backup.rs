//! Copia di sicurezza del database (`dashboard.db`): esportazione in un file scelto dall'utente e importazione
//! che sostituisce il DB di questo dispositivo. Serve soprattutto su Android, dove il file sta nei dati privati
//! dell'app e a mano non si raggiunge.
//!
//! - Esportazione: la copia coerente la fa SQLite (`VACUUM INTO` dalla pagina, nel file di `db_export_prepare`),
//!   poi `db_export_save` la scrive dove ha scelto l'utente (anche un URI `content://`, con il plugin fs).
//! - Importazione: `db_import_stage` controlla il file scelto e lo copia accanto al DB; la pagina chiude il DB e
//!   `db_import_apply` lo mette al posto di quello vecchio. Poi la pagina si ricarica e le migrazioni lo portano
//!   all'ultima versione.
//!
//! I percorsi dell'app (DB, file temporanei) li decide sempre questo file: dalla pagina arrivano solo il file scelto
//! nel selettore e la versione dello schema.

use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::str::FromStr;
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

/// Lo stesso nome di `Database.load("sqlite:dashboard.db")` (src/core/db/client.ts), nella cartella che usa il plugin sql.
const DB_FILE: &str = "dashboard.db";
const STAGED_FILE: &str = "dashboard.db.import";
const EXPORT_FILE: &str = "dashboard-export.db";
/// Il DB sostituito dall'ultima importazione (vedi `db_import_apply`).
const PREVIOUS_FILE: &str = "dashboard.db.prima";
/// Inizio di ogni file SQLite 3.
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";
/// Un database più grande di così non è il nostro (oggi pochi MB).
const MAX_IMPORT_BYTES: u64 = 2 * 1024 * 1024 * 1024;

fn db_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|_| "Cartella dei dati non trovata".to_string())
}

fn export_temp(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|_| "Cartella temporanea non trovata".to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("Cartella temporanea non creata: {e}"))?;
    Ok(dir.join(EXPORT_FILE))
}

fn picked(path: &str) -> Result<FilePath, String> {
    FilePath::from_str(path).map_err(|_| "File non valido".to_string())
}

/// Percorso (vuoto) dove la pagina fa `VACUUM INTO`: SQLite non scrive su un file che esiste già.
#[tauri::command]
pub fn db_export_prepare(app: AppHandle) -> Result<String, String> {
    let temp = export_temp(&app)?;
    if temp.exists() {
        fs::remove_file(&temp).map_err(|e| format!("File temporaneo non tolto: {e}"))?;
    }
    temp.into_os_string().into_string().map_err(|_| "Percorso non valido".to_string())
}

/// Copia l'esportazione preparata nel file scelto dall'utente (percorso o `content://`) e toglie quella temporanea.
#[tauri::command]
pub async fn db_export_save(app: AppHandle, target: String) -> Result<(), String> {
    let temp = export_temp(&app)?;
    let mut source = fs::File::open(&temp).map_err(|_| "Esportazione non preparata".to_string())?;
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    let result = app
        .fs()
        .open(picked(&target)?, options)
        .map_err(|e| format!("Impossibile scrivere il file: {e}"))
        .and_then(|mut out| {
            std::io::copy(&mut source, &mut out).map_err(|e| format!("Copia non riuscita: {e}"))?;
            out.flush().map_err(|e| format!("Copia non riuscita: {e}"))?;
            out.sync_all().ok();
            Ok(())
        });
    drop(source);
    let _ = fs::remove_file(&temp);
    result
}

/// Legge la versione dello schema (`PRAGMA user_version`, byte 60-63 dell'intestazione).
fn check_header(head: &[u8], max_version: u32) -> Result<u32, String> {
    if head.len() < 100 || &head[..16] != SQLITE_HEADER {
        return Err("Il file non è un database dell'app".to_string());
    }
    let version = u32::from_be_bytes([head[60], head[61], head[62], head[63]]);
    if version == 0 {
        return Err("Il file non è un database dell'app".to_string());
    }
    if version > max_version {
        return Err("Il file viene da una versione più nuova dell'app: aggiorna prima l'app".to_string());
    }
    Ok(version)
}

/// Controlla il file scelto e lo copia accanto al DB, pronto per `db_import_apply`. Non tocca ancora il DB.
#[tauri::command]
pub async fn db_import_stage(app: AppHandle, source: String, max_version: u32) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.read(true);
    let mut input = app
        .fs()
        .open(picked(&source)?, options)
        .map_err(|e| format!("Impossibile leggere il file: {e}"))?;
    let staged = db_dir(&app)?.join(STAGED_FILE);
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let mut head = [0u8; 100];
        input.read_exact(&mut head).map_err(|_| "Il file non è un database dell'app".to_string())?;
        check_header(&head, max_version)?;
        let mut out = fs::File::create(&staged).map_err(|e| format!("Copia non riuscita: {e}"))?;
        out.write_all(&head).map_err(|e| format!("Copia non riuscita: {e}"))?;
        let copied = std::io::copy(&mut input.take(MAX_IMPORT_BYTES), &mut out);
        let synced = out.sync_all().is_ok();
        drop(out);
        let result = match copied {
            Ok(n) if n >= MAX_IMPORT_BYTES => Err("Il file è troppo grande per essere un database dell'app".to_string()),
            Ok(_) if synced => Ok(()),
            _ => Err("Copia non riuscita".to_string()),
        };
        if result.is_err() {
            let _ = fs::remove_file(&staged);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Mette il file preparato al posto del DB. Da chiamare con il DB chiuso (plugin sql `close`): il WAL del DB vecchio
/// va tolto, altrimenti SQLite lo applicherebbe al nuovo.
#[tauri::command]
pub fn db_import_apply(app: AppHandle) -> Result<(), String> {
    let dir = db_dir(&app)?;
    let staged = dir.join(STAGED_FILE);
    if !staged.exists() {
        return Err("Nessun file da importare".to_string());
    }
    for suffix in ["-wal", "-shm", "-journal"] {
        let side = dir.join(format!("{DB_FILE}{suffix}"));
        if side.exists() {
            fs::remove_file(&side).map_err(|e| format!("Database ancora in uso: {e}"))?;
        }
    }
    // Il DB di prima non si butta: resta accanto come `dashboard.db.prima` (uno solo, l'ultimo). Il file scelto ha
    // passato solo il controllo dell'intestazione: se fosse rovinato, i dati di prima si recuperano rinominandolo.
    let current = dir.join(DB_FILE);
    let previous = dir.join(PREVIOUS_FILE);
    let had_current = current.exists();
    if had_current {
        let _ = fs::remove_file(&previous);
        fs::rename(&current, &previous).map_err(|e| format!("Database ancora in uso: {e}"))?;
    }
    fs::rename(&staged, &current).map_err(|e| {
        if had_current {
            let _ = fs::rename(&previous, &current);
        }
        format!("Database non sostituito: {e}")
    })
}
