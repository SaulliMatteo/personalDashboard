// Nessun comando esposto al frontend: il plugin lo chiama solo Rust (src-tauri/src/secure_store.rs),
// quindi non genera permessi e il JavaScript non può raggiungerlo direttamente.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
