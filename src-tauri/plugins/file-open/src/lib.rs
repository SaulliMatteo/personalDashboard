//! Aprire o condividere un file del Quaderno su Android: l'equivalente di `openPath` del desktop.
//!
//! Da Android 7 un percorso `file://` non si può passare a un'altra app: la parte nativa
//! (`android/src/main/java/FileOpenPlugin.kt`) ne fa un URI `content://` del FileProvider dell'app
//! (dichiarato in gen/android, `${applicationId}.fileprovider`) e concede la sola lettura all'app scelta.
//! Lo usa solo `src-tauri/src/file_open.rs`: niente comandi per il frontend.
#![cfg(target_os = "android")]

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

const PLUGIN_IDENTIFIER: &str = "it.matteo.fileopen";

/// Perché un file non si è aperto.
#[derive(Debug)]
pub enum OpenError {
    /// Nessuna app installata sa aprire questo tipo di file.
    NoApp,
    Failed,
}

#[derive(Serialize)]
struct PathArgs<'a> {
    path: &'a str,
}

#[derive(Deserialize)]
struct OpenResponse {
    #[serde(default)]
    opened: bool,
}

pub struct FileOpen<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> FileOpen<R> {
    /// Apre il file con l'app predefinita per il suo tipo (o fa scegliere quale).
    pub fn open(&self, path: &str) -> Result<(), OpenError> {
        let response = self
            .0
            .run_mobile_plugin::<OpenResponse>("open", PathArgs { path })
            .map_err(|_| OpenError::Failed)?;
        if response.opened {
            Ok(())
        } else {
            Err(OpenError::NoApp)
        }
    }

    /// Foglio "Condividi" di Android con il file.
    pub fn share(&self, path: &str) -> Result<(), OpenError> {
        self.0
            .run_mobile_plugin::<serde::de::IgnoredAny>("share", PathArgs { path })
            .map(|_| ())
            .map_err(|_| OpenError::Failed)
    }
}

pub trait FileOpenExt<R: Runtime> {
    fn file_open(&self) -> &FileOpen<R>;
}

impl<R: Runtime, T: Manager<R>> FileOpenExt<R> for T {
    fn file_open(&self) -> &FileOpen<R> {
        self.state::<FileOpen<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("file-open")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "FileOpenPlugin")?;
            app.manage(FileOpen(handle));
            Ok(())
        })
        .build()
}
