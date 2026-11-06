//! Aprire e condividere i file del Quaderno su Android (allegati e file delle raccolte), tramite il
//! plugin `plugins/file-open`. Sul desktop il frontend usa `openPath`/`revealItemInDir` del plugin
//! opener e questi comandi rispondono "non disponibile". Lato frontend li chiama solo
//! `widgets/notes/data/filesApi.ts`.
//!
//! Si accettano solo file che stanno davvero nella cartella del Quaderno (`Documenti/Notes`): la
//! pagina non può far condividere ad altre app il database o altri file dell'app.

#[tauri::command]
pub async fn file_open(app: tauri::AppHandle, path: String) -> Result<(), String> {
    imp::open(&app, &path)
}

#[tauri::command]
pub async fn file_share(app: tauri::AppHandle, path: String) -> Result<(), String> {
    imp::share(&app, &path)
}

#[cfg(target_os = "android")]
mod imp {
    use std::path::PathBuf;
    use tauri::Manager;
    use tauri_plugin_file_open::{FileOpenExt, OpenError};

    const ERR: &str = "Impossibile aprire il file";

    /// Il percorso reale del file, solo se è un file dentro `Documenti/Notes`.
    fn vault_file(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
        let vault = app
            .path()
            .document_dir()
            .map_err(|_| ERR.to_string())?
            .join("Notes")
            .canonicalize()
            .map_err(|_| ERR.to_string())?;
        // canonicalize risolve ".." e i collegamenti: il controllo vale sul file vero
        let file = PathBuf::from(path).canonicalize().map_err(|_| "File non trovato".to_string())?;
        if !file.starts_with(&vault) || !file.is_file() {
            return Err("File fuori dalla cartella del Quaderno".into());
        }
        Ok(file)
    }

    fn message(error: OpenError) -> String {
        match error {
            OpenError::NoApp => "Nessuna app installata apre questo tipo di file".into(),
            OpenError::Failed => ERR.into(),
        }
    }

    pub fn open(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
        let file = vault_file(app, path)?;
        app.file_open().open(&file.to_string_lossy()).map_err(message)
    }

    pub fn share(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
        let file = vault_file(app, path)?;
        app.file_open().share(&file.to_string_lossy()).map_err(message)
    }
}

/// Desktop: si apre con il plugin opener, questi comandi non servono.
#[cfg(not(target_os = "android"))]
mod imp {
    const ERR: &str = "Non disponibile su questo sistema";

    pub fn open(_app: &tauri::AppHandle, _path: &str) -> Result<(), String> {
        Err(ERR.into())
    }

    pub fn share(_app: &tauri::AppHandle, _path: &str) -> Result<(), String> {
        Err(ERR.into())
    }
}
