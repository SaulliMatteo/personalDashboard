// Nessun comando esposto al frontend: il plugin lo chiama solo Rust (src-tauri/src/file_open.rs),
// che controlla prima che il file stia nella cartella del Quaderno.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
