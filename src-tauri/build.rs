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

    // Su macOS l'app installata gira da http://localhost (tauri-plugin-localhost), che per Tauri è
    // un'origine remota: da lì i comandi dell'app passano dall'ACL come quelli dei plugin. Il
    // manifesto genera i permessi `allow-<comando>`, concessi in capabilities/default.json.
    // Un comando nuovo va in generate_handler! (src/lib.rs), qui e in quella capability.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "ft_start_server",
            "ft_stop_server",
            "ft_status",
            "ft_list_files",
            "ft_read_preview",
            "ft_open_folder",
            "companion_snapshot",
            "notify_with_image",
            "secure_store_get",
            "secure_store_set",
            "secure_store_remove",
        ]),
    ))
    .expect("errore nel build di Tauri");
}
