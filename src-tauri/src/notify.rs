//! Notifiche con un'immagine (la faccia di Pixy). `tauri-plugin-notification` su
//! Windows la ignora (notify-rust passa al toast solo `image_path`, non `icon`),
//! quindi il toast si costruisce qui con `tauri-winrt-notification`, la stessa
//! libreria che usa il plugin. Sugli altri sistemi ritorna `false` e il frontend
//! ripiega sulla notifica del plugin (`core/notify/notifier.ts`).

#[cfg(windows)]
use tauri::Manager;

#[tauri::command]
pub async fn notify_with_image(
    app: tauri::AppHandle,
    title: String,
    lines: Vec<String>,
    image_data_url: String,
) -> Result<bool, String> {
    imp::show(&app, &title, &lines, &image_data_url)
}

#[cfg(windows)]
mod imp {
    use super::*;
    use base64::Engine;
    use std::hash::{Hash, Hasher};
    use std::path::MAIN_SEPARATOR as SEP;
    use tauri_winrt_notification::{IconCrop, Toast};

    pub fn show(app: &tauri::AppHandle, title: &str, lines: &[String], image_data_url: &str) -> Result<bool, String> {
        let b64 = image_data_url
            .strip_prefix("data:image/png;base64,")
            .ok_or("immagine non PNG")?;
        let png = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| e.to_string())?;

        // Nome dal contenuto: Windows tiene in cache le immagini dei toast per percorso,
        // con un nome fisso mostrerebbe la faccia vecchia. Le varianti sono poche.
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        png.hash(&mut hasher);
        let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("notifiche");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(format!("pixy-{:016x}.png", hasher.finish()));
        if !path.exists() {
            std::fs::write(&path, &png).map_err(|e| e.to_string())?;
        }

        let mut toast = Toast::new(&app_id(app))
            .title(title)
            .icon(&path, IconCrop::Square, "Pixy");
        if let Some(line) = lines.first() {
            toast = toast.text1(line);
        }
        if let Some(line) = lines.get(1) {
            toast = toast.text2(line);
        }
        toast.show().map_err(|e| format!("{e:?}"))?;
        Ok(true)
    }

    /// Come il plugin: l'ID dell'app solo nella versione installata; da `target/debug|release`
    /// Windows non lo conosce e il toast non comparirebbe, quindi si usa quello di PowerShell.
    fn app_id(app: &tauri::AppHandle) -> String {
        let installed = tauri::utils::platform::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.display().to_string()))
            .is_some_and(|dir| {
                !(dir.ends_with(&format!("{SEP}target{SEP}debug")) || dir.ends_with(&format!("{SEP}target{SEP}release")))
            });
        if installed {
            app.config().identifier.clone()
        } else {
            Toast::POWERSHELL_APP_ID.to_string()
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn show(_app: &tauri::AppHandle, _title: &str, _lines: &[String], _image_data_url: &str) -> Result<bool, String> {
        Ok(false)
    }
}
