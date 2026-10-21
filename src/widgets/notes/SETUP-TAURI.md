# Notes: installazione passo per passo

## 1. Copia i file
Decomprimi lo zip e sposta la cartella `notes` in `src/widgets/notes/`.
(Se avevi già una versione precedente, sostituiscila per intero.)
I file `migration-v4.txt`, `migration-v5.txt` e questo `SETUP-TAURI.md` servono solo come guida: dopo l'installazione puoi cancellarli.

## 2. Pacchetti npm
    npm install @tauri-apps/api @tauri-apps/plugin-fs @tauri-apps/plugin-dialog @tauri-apps/plugin-opener

## 3. src-tauri/Cargo.toml  →  sezione [dependencies], aggiungi
    tauri-plugin-fs = "2"
    tauri-plugin-dialog = "2"
    tauri-plugin-opener = "2"

Se cargo segnala un conflitto con `tauri = "2.11.3"` (come con notification),
fissa il plugin a una versione compatibile ("=2.x.y") verificandola su crates.io,
oppure aggiorna `tauri`.

## 4. src-tauri/src/lib.rs  →  sostituisci con
    #[cfg_attr(mobile, tauri::mobile_entry_point)]
    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_sql::Builder::new().build())
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_opener::init())
            .setup(|app| {
                if cfg!(debug_assertions) {
                    app.handle().plugin(
                        tauri_plugin_log::Builder::default()
                            .level(log::LevelFilter::Info)
                            .build(),
                    )?;
                }
                Ok(())
            })
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }

## 5. src-tauri/capabilities/default.json  →  sostituisci con
    {
      "$schema": "../gen/schemas/desktop-schema.json",
      "identifier": "default",
      "description": "enables the default permissions",
      "windows": ["main"],
      "permissions": [
        "core:default",
        "sql:default",
        "sql:allow-execute",
        "notification:default",
        "dialog:default",
        "opener:default",
        { "identifier": "opener:allow-open-path", "allow": [{ "path": "$DOCUMENT/Notes" }, { "path": "$DOCUMENT/Notes/**" }] },
        { "identifier": "fs:allow-read-file", "allow": [{ "path": "$DESKTOP/**" }, { "path": "$DOCUMENT/**" }, { "path": "$DOWNLOAD/**" }, { "path": "$PICTURE/**" }, { "path": "$HOME/**" }] },
        { "identifier": "fs:allow-read-text-file", "allow": [{ "path": "$DESKTOP/**" }, { "path": "$DOCUMENT/**" }, { "path": "$DOWNLOAD/**" }, { "path": "$PICTURE/**" }, { "path": "$HOME/**" }] },
        { "identifier": "fs:allow-read-dir", "allow": [{ "path": "$DOCUMENT/Notes" }, { "path": "$DOCUMENT/Notes/**" }] },
        { "identifier": "fs:allow-exists", "allow": [{ "path": "$DOCUMENT/Notes" }, { "path": "$DOCUMENT/Notes/**" }] },
        { "identifier": "fs:allow-mkdir", "allow": [{ "path": "$DOCUMENT/Notes" }, { "path": "$DOCUMENT/Notes/**" }] },
        { "identifier": "fs:allow-write-file", "allow": [{ "path": "$DOCUMENT/Notes/**" }] },
        { "identifier": "fs:allow-write-text-file", "allow": [{ "path": "$DOCUMENT/Notes/**" }] },
        { "identifier": "fs:allow-rename", "allow": [{ "path": "$DOCUMENT/Notes/**" }] },
        { "identifier": "fs:allow-remove", "allow": [{ "path": "$DOCUMENT/Notes/**" }] }
      ]
    }

## 6. src/core/db/migrations.ts
In fondo all'array MIGRATIONS, dopo la migrazione 3, incolla IN ORDINE il contenuto di
`migration-v4.txt` e poi di `migration-v5.txt` (due blocchi `{ version: ..., ... },`).

## 7. src/widgets/registry.ts
    import { notesWidget } from "./notes";
    export const WIDGET_REGISTRY: WidgetDefinition[] = [studyWidget, notesWidget];

## 8. src/features/sidebar/Sidebar.tsx
    const { view, goToDashboard, openWidgetDetail } = useNav();
    ...
    <button
      className={`nav-item${view.type === "widgetDetail" && view.widgetId === "notes" ? " active" : ""}`}
      onClick={() => openWidgetDetail("notes")}
    >
      Notes
    </button>

## 9. (consigliato) src/styles/base.css, in fondo
    select option { background: var(--bg-card); color: var(--text-primary); }

## 10. Avvio
    npm run tauri dev
La prima compilazione Rust con i nuovi plugin richiede qualche minuto.
