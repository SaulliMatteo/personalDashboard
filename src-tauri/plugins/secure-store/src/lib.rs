//! Archivio sicuro della sessione dei Gruppi su Android: l'equivalente del portachiavi del desktop.
//!
//! La parte nativa (`android/src/main/java/SecureStorePlugin.kt`) tiene una chiave AES-256-GCM
//! nell'Android Keystore (non esportabile) e salva i valori cifrati nella cartella privata dell'app
//! esclusa dal backup. Lo usa solo `src-tauri/src/secure_store.rs`: niente comandi per il frontend.
//!
//! I valori sono token: non passano mai dai log né dai messaggi di errore.
#![cfg(target_os = "android")]

use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

const PLUGIN_IDENTIFIER: &str = "it.matteo.securestore";

/// Errore senza dettagli: chi chiama mostra una frase fissa.
#[derive(Debug)]
pub struct Unavailable;

#[derive(Serialize)]
struct KeyArgs<'a> {
    key: &'a str,
}

#[derive(Serialize)]
struct SetArgs<'a> {
    key: &'a str,
    value: &'a str,
}

#[derive(Deserialize)]
struct GetResponse {
    #[serde(default)]
    value: Option<String>,
}

pub struct SecureStore<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> SecureStore<R> {
    /// Valore salvato, oppure None se non c'è (o non si può più decifrare).
    pub fn get(&self, key: &str) -> Result<Option<String>, Unavailable> {
        self.0
            .run_mobile_plugin::<GetResponse>("get", KeyArgs { key })
            .map(|r| r.value)
            .map_err(|_| Unavailable)
    }

    pub fn set(&self, key: &str, value: &str) -> Result<(), Unavailable> {
        self.0
            // `invoke.resolve()` senza dati: la risposta può essere null, va solo ignorata
            .run_mobile_plugin::<IgnoredAny>("set", SetArgs { key, value })
            .map(|_| ())
            .map_err(|_| Unavailable)
    }

    pub fn remove(&self, key: &str) -> Result<(), Unavailable> {
        self.0
            .run_mobile_plugin::<IgnoredAny>("remove", KeyArgs { key })
            .map(|_| ())
            .map_err(|_| Unavailable)
    }
}

pub trait SecureStoreExt<R: Runtime> {
    fn secure_store(&self) -> &SecureStore<R>;
}

impl<R: Runtime, T: Manager<R>> SecureStoreExt<R> for T {
    fn secure_store(&self) -> &SecureStore<R> {
        self.state::<SecureStore<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("secure-store")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "SecureStorePlugin")?;
            app.manage(SecureStore(handle));
            Ok(())
        })
        .build()
}
