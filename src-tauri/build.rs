fn main() {
    // Il motore HTTP di File Transfer è scritto in C (Winsock su Windows,
    // socket POSIX su macOS e Linux, vedi filetransfer/c/platform.h). Sugli
    // altri sistemi l'app si compila comunque e il widget segnala che il
    // server non è disponibile.
    // `ft_native` dice a file_transfer.rs che il server C è stato collegato.
    println!("cargo:rustc-check-cfg=cfg(ft_native)");
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if matches!(target_os.as_str(), "windows" | "macos" | "linux") {
        println!("cargo:rustc-cfg=ft_native");
        let files = ["network.c", "http.c", "httpserver.c"];
        let headers = ["platform.h", "network.h", "http.h", "httpserver.h"];

        for name in files.iter().chain(headers.iter()) {
            println!("cargo:rerun-if-changed=filetransfer/c/{name}");
        }

        cc::Build::new()
            .files(files.iter().map(|f| format!("filetransfer/c/{f}")))
            .include("filetransfer/c")
            .warnings(true)
            .compile("file_transfer_server");

        if target_os == "windows" {
            println!("cargo:rustc-link-lib=ws2_32");
        }
    }

    tauri_build::build()
}
