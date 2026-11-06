//! Archivio della sessione dei Gruppi. Lato frontend lo usa solo l'adattatore di
//! `core/cloud/secureStorage.ts` come storage di supabase-js. Mai SQLite o localStorage.
//!
//! Windows: Credential Manager tramite `keyring`. Accetta al massimo 2560 byte per voce (1280
//! caratteri UTF-16), meno di una sessione Supabase: il valore si divide in pezzi `<chiave>#0`, `#1`…
//! e la voce `<chiave>` contiene solo quanti sono. Si scrivono prima i pezzi e poi l'indice, così una
//! scrittura interrotta lascia al più la sessione precedente (o nessuna), mai un valore mescolato.
//!
//! macOS: un file per chiave in `<dati dell'app>/sessione/` (cartella 700, file 600: solo l'utente).
//! Niente Keychain: senza un Team ID di Apple (account a pagamento) il Keychain riconosce l'app
//! dall'hash del binario, diverso a ogni versione, e a ogni aggiornamento chiede la password del
//! portachiavi (anche con la firma autofirmata stabile); se la richiesta viene annullata la sessione
//! è persa. Le voci delle versioni fino alla 1.0.9 (servizi `<identifier>` e `<identifier>.sessione`)
//! non si leggono né si cancellano: toccarle farebbe comparire la richiesta.
//!
//! Android: Android Keystore tramite il plugin `plugins/secure-store` (stessa interfaccia, senza pezzi).
//!
//! I valori sono token: non vanno mai nei log né nei messaggi di errore (che sono frasi fisse).

/// Caratteri per pezzo: margine sotto i 1280 del Credential Manager.
#[cfg(windows)]
const CHUNK_CHARS: usize = 1000;
/// Limite al valore intero (una sessione ne occupa pochi KB).
#[cfg(any(windows, target_os = "macos", target_os = "android"))]
const MAX_CHARS: usize = 64 * 1024;
#[cfg(windows)]
const MAX_CHUNKS: usize = MAX_CHARS / CHUNK_CHARS + 1;

/// Le chiavi le sceglie l'app (es. "gruppi-auth"): niente caratteri strani nei nomi delle voci.
fn valid_key(key: &str) -> bool {
    !key.is_empty() && key.len() <= 64 && key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Dove vanno le voci: su Windows (e Linux) il "servizio" del portachiavi è l'identificatore
/// dell'app, su macOS la cartella dati dell'app, su Android serve l'app stessa per il plugin.
#[cfg(not(any(target_os = "android", target_os = "macos")))]
fn target(app: &tauri::AppHandle) -> Result<&str, String> {
    Ok(&app.config().identifier)
}

#[cfg(target_os = "macos")]
fn target(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    app.path().app_data_dir().map_err(|_| imp::ERR.to_string())
}

#[cfg(target_os = "android")]
fn target(app: &tauri::AppHandle) -> Result<&tauri::AppHandle, String> {
    Ok(app)
}

#[tauri::command]
pub async fn secure_store_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    if !valid_key(&key) {
        return Err("Chiave non valida".into());
    }
    imp::get(&target(&app)?, &key)
}

#[tauri::command]
pub async fn secure_store_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    if !valid_key(&key) {
        return Err("Chiave non valida".into());
    }
    imp::set(&target(&app)?, &key, &value)
}

#[tauri::command]
pub async fn secure_store_remove(app: tauri::AppHandle, key: String) -> Result<(), String> {
    if !valid_key(&key) {
        return Err("Chiave non valida".into());
    }
    imp::remove(&target(&app)?, &key)
}

#[cfg(windows)]
mod imp {
    use super::{CHUNK_CHARS, MAX_CHARS, MAX_CHUNKS};
    use keyring::{Entry, Error};

    const ERR: &str = "Portachiavi del sistema non disponibile";

    fn entry(service: &str, user: &str) -> Result<Entry, String> {
        Entry::new(service, user).map_err(|_| ERR.to_string())
    }

    fn read(service: &str, user: &str) -> Result<Option<String>, String> {
        match entry(service, user)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(Error::NoEntry) => Ok(None),
            Err(_) => Err(ERR.into()),
        }
    }

    fn delete(service: &str, user: &str) -> Result<(), String> {
        match entry(service, user)?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(_) => Err(ERR.into()),
        }
    }

    fn chunk_name(key: &str, i: usize) -> String {
        format!("{key}#{i}")
    }

    /// Numero di pezzi salvati, se l'indice esiste ed è sensato.
    fn chunk_count(service: &str, key: &str) -> Result<Option<usize>, String> {
        Ok(read(service, key)?
            .and_then(|v| v.strip_prefix("n:").and_then(|n| n.parse::<usize>().ok()))
            .filter(|n| *n <= MAX_CHUNKS))
    }

    pub fn get(service: &str, key: &str) -> Result<Option<String>, String> {
        let Some(count) = chunk_count(service, key)? else {
            return Ok(None);
        };
        let mut value = String::new();
        for i in 0..count {
            match read(service, &chunk_name(key, i))? {
                Some(part) => value.push_str(&part),
                None => {
                    // pezzo mancante: il valore è inservibile, meglio nessuna sessione
                    remove(service, key)?;
                    return Ok(None);
                }
            }
        }
        Ok(Some(value))
    }

    pub fn set(service: &str, key: &str, value: &str) -> Result<(), String> {
        let chars: Vec<char> = value.chars().collect();
        if chars.len() > MAX_CHARS {
            return Err("Valore troppo grande per il portachiavi".into());
        }
        let old = chunk_count(service, key)?.unwrap_or(0);
        let parts: Vec<String> = chars.chunks(CHUNK_CHARS).map(|c| c.iter().collect()).collect();
        for (i, part) in parts.iter().enumerate() {
            entry(service, &chunk_name(key, i))?
                .set_password(part)
                .map_err(|_| ERR.to_string())?;
        }
        entry(service, key)?
            .set_password(&format!("n:{}", parts.len()))
            .map_err(|_| ERR.to_string())?;
        for i in parts.len()..old {
            delete(service, &chunk_name(key, i))?;
        }
        Ok(())
    }

    pub fn remove(service: &str, key: &str) -> Result<(), String> {
        let count = chunk_count(service, key)?.unwrap_or(0);
        delete(service, key)?;
        for i in 0..count {
            delete(service, &chunk_name(key, i))?;
        }
        Ok(())
    }
}

/// macOS: un file per chiave in `<dati dell'app>/sessione/` (vedi in cima al file).
#[cfg(target_os = "macos")]
mod imp {
    use super::MAX_CHARS;
    use std::fs::{self, DirBuilder, OpenOptions};
    use std::io::{ErrorKind, Write};
    use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    pub const ERR: &str = "Archivio della sessione non disponibile";

    fn dir(base: &Path) -> PathBuf {
        base.join("sessione")
    }

    /// Crea la cartella (solo l'utente) e la richiude se esisteva con permessi più larghi.
    fn ensure_dir(base: &Path) -> Result<PathBuf, String> {
        let dir = dir(base);
        DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&dir)
            .map_err(|_| ERR.to_string())?;
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).map_err(|_| ERR.to_string())?;
        Ok(dir)
    }

    pub fn get(base: &Path, key: &str) -> Result<Option<String>, String> {
        match fs::read_to_string(dir(base).join(key)) {
            Ok(v) => Ok(Some(v)),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
            Err(_) => Err(ERR.into()),
        }
    }

    /// Scrive in un file temporaneo nuovo (600) e lo rinomina: chi legge vede il valore vecchio
    /// o quello nuovo, mai uno a metà. Le chiavi non hanno punti, quindi `.tmp` non si confonde.
    pub fn set(base: &Path, key: &str, value: &str) -> Result<(), String> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        if value.chars().count() > MAX_CHARS {
            return Err("Valore troppo grande per l'archivio della sessione".into());
        }
        let dir = ensure_dir(base)?;
        let tmp = dir.join(format!("{key}.{}.{}.tmp", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
        let written = (|| {
            let mut f = OpenOptions::new().write(true).create_new(true).mode(0o600).open(&tmp)?;
            f.write_all(value.as_bytes())?;
            f.sync_all()?;
            fs::rename(&tmp, dir.join(key))
        })();
        if written.is_err() {
            let _ = fs::remove_file(&tmp);
            return Err(ERR.into());
        }
        Ok(())
    }

    pub fn remove(base: &Path, key: &str) -> Result<(), String> {
        match fs::remove_file(dir(base).join(key)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
            Err(_) => Err(ERR.into()),
        }
    }
}

/// Android: chiave nell'Android Keystore e valori cifrati nei file privati dell'app (vedi
/// `plugins/secure-store`). Nessun limite di lunghezza per voce, quindi niente pezzi.
#[cfg(target_os = "android")]
mod imp {
    use super::MAX_CHARS;
    use tauri_plugin_secure_store::SecureStoreExt;

    const ERR: &str = "Archivio sicuro di Android non disponibile";

    pub fn get(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
        app.secure_store().get(key).map_err(|_| ERR.into())
    }

    pub fn set(app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), String> {
        if value.chars().count() > MAX_CHARS {
            return Err("Valore troppo grande per l'archivio sicuro".into());
        }
        app.secure_store().set(key, value).map_err(|_| ERR.into())
    }

    pub fn remove(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
        app.secure_store().remove(key).map_err(|_| ERR.into())
    }
}

/// Altri sistemi (oggi Linux): niente portachiavi, quindi niente accesso ai Gruppi.
/// L'app compila e il frontend mostra l'errore.
#[cfg(not(any(windows, target_os = "macos", target_os = "android")))]
mod imp {
    const ERR: &str = "Portachiavi non supportato su questo sistema";

    pub fn get(_service: &str, _key: &str) -> Result<Option<String>, String> {
        Err(ERR.into())
    }

    pub fn set(_service: &str, _key: &str, _value: &str) -> Result<(), String> {
        Err(ERR.into())
    }

    pub fn remove(_service: &str, _key: &str) -> Result<(), String> {
        Err(ERR.into())
    }
}

/// Prova sull'archivio vero (`cargo test secure_store`): su Windows il portachiavi (servizio di
/// test a parte), su macOS una cartella temporanea. Tutto ripulito alla fine.
#[cfg(all(test, any(windows, target_os = "macos")))]
mod tests {
    use super::imp;

    #[cfg(target_os = "macos")]
    #[test]
    fn valore_lungo_in_un_file() {
        use std::os::unix::fs::PermissionsExt;
        let base = std::env::temp_dir().join(format!("pd-sessione-test-{}", std::process::id()));
        let key = "prova-sessione";
        assert_eq!(imp::get(&base, key).unwrap(), None);

        let long: String = (0..5_500).map(|i| char::from(b'a' + (i % 26) as u8)).collect();
        imp::set(&base, key, &long).unwrap();
        assert_eq!(imp::get(&base, key).unwrap().as_deref(), Some(long.as_str()));
        let mode = |p: std::path::PathBuf| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(base.join("sessione")), 0o700);
        assert_eq!(mode(base.join("sessione").join(key)), 0o600);

        imp::set(&base, key, "breve-àè").unwrap();
        assert_eq!(imp::get(&base, key).unwrap().as_deref(), Some("breve-àè"));
        // nessun file temporaneo rimasto
        assert_eq!(std::fs::read_dir(base.join("sessione")).unwrap().count(), 1);

        imp::remove(&base, key).unwrap();
        assert_eq!(imp::get(&base, key).unwrap(), None);
        // togliere una voce che non c'è non è un errore
        imp::remove(&base, key).unwrap();
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn valore_lungo_a_pezzi() {
        const SERVICE: &str = "it.matteo.personalDashboard.test";
        let key = "prova-sessione";
        let long: String = (0..5_500).map(|i| char::from(b'a' + (i % 26) as u8)).collect();
        imp::set(SERVICE, key, &long).unwrap();
        assert_eq!(imp::get(SERVICE, key).unwrap().as_deref(), Some(long.as_str()));

        // più corto: i pezzi in più vanno cancellati
        imp::set(SERVICE, key, "breve-àè").unwrap();
        assert_eq!(imp::get(SERVICE, key).unwrap().as_deref(), Some("breve-àè"));
        assert_eq!(imp::get(SERVICE, "prova-sessione#5").unwrap(), None);

        imp::remove(SERVICE, key).unwrap();
        assert_eq!(imp::get(SERVICE, key).unwrap(), None);
        assert_eq!(imp::get(SERVICE, "prova-sessione#0").unwrap(), None);
    }

    #[test]
    fn chiavi_non_valide() {
        assert!(!super::valid_key(""));
        assert!(!super::valid_key("Maiuscole"));
        assert!(!super::valid_key("con#cancelletto"));
        assert!(super::valid_key("gruppi-auth-code-verifier"));
    }
}
