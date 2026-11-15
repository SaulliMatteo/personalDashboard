// Nessun comando esposto al frontend: il plugin lo chiama solo Rust (src-tauri/src/screen_time/android.rs).
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
