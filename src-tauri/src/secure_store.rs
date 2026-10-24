//! Archivio sicuro della sessione dei Gruppi: il portachiavi del sistema (Credential Manager su
//! Windows, Keychain su macOS) tramite `keyring`. Lato frontend lo usa solo l'adattatore di
//! `core/cloud/secureStorage.ts` come storage di supabase-js. Mai SQLite, localStorage o file.
//!
//! Il Credential Manager accetta al massimo 2560 byte per voce (1280 caratteri UTF-16), meno di
//! una sessione Supabase: il valore si divide in pezzi `<chiave>#0`, `#1`… e la voce `<chiave>`
//! contiene solo quanti sono. Si scrivono prima i pezzi e poi l'indice, così una scrittura
//! interrotta lascia al più la sessione precedente (o nessuna), mai un valore mescolato.
//!
//! I valori sono token: non vanno mai nei log né nei messaggi di errore (che sono frasi fisse).

/// Caratteri per pezzo: margine sotto i 1280 del Credential Manager.
#[cfg(any(windows, target_os = "macos"))]
const CHUNK_CHARS: usize = 1000;
/// Limite al valore intero (una sessione ne occupa pochi KB).
#[cfg(any(windows, target_os = "macos"))]
const MAX_CHARS: usize = 64 * 1024;
#[cfg(any(windows, target_os = "macos"))]
const MAX_CHUNKS: usize = MAX_CHARS / CHUNK_CHARS + 1;

/// Le chiavi le sceglie l'app (es. "gruppi-auth"): niente caratteri strani nei nomi delle voci.
fn valid_key(key: &str) -> bool {
    !key.is_empty() && key.len() <= 64 && key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

#[tauri::command]
pub async fn secure_store_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    if !valid_key(&key) {
        return Err("Chiave non valida".into());
    }
    imp::get(&app.config().identifier, &key)
}

#[tauri::command]
pub async fn secure_store_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    if !valid_key(&key) {
        return Err("Chiave non valida".into());
    }
    imp::set(&app.config().identifier, &key, &value)
}

#[tauri::command]
pub async fn secure_store_remove(app: tauri::AppHandle, key: String) -> Result<(), String> {
    if !valid_key(&key) {
        return Err("Chiave non valida".into());
    }
    imp::remove(&app.config().identifier, &key)
}

#[cfg(any(windows, target_os = "macos"))]
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

/// Altri sistemi (oggi Linux): niente portachiavi, quindi niente accesso ai Gruppi.
/// L'app compila e il frontend mostra l'errore.
#[cfg(not(any(windows, target_os = "macos")))]
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

/// Prova sul portachiavi vero (servizio di test a parte, ripulito alla fine): `cargo test secure_store`.
#[cfg(all(test, any(windows, target_os = "macos")))]
mod tests {
    use super::imp;

    const SERVICE: &str = "it.matteo.personalDashboard.test";

    #[test]
    fn valore_lungo_a_pezzi() {
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
