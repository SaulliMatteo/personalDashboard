fn main() {
    // Il motore HTTP di File Transfer è scritto in C su Winsock: lo compiliamo
    // e lo colleghiamo solo per Windows. Sugli altri sistemi l'app si compila
    // comunque e il widget segnala che il server non è disponibile.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let files = ["network.c", "http.c", "httpserver.c"];
        let headers = ["network.h", "http.h", "httpserver.h"];

        for name in files.iter().chain(headers.iter()) {
            println!("cargo:rerun-if-changed=filetransfer/c/{name}");
        }

        cc::Build::new()
            .files(files.iter().map(|f| format!("filetransfer/c/{f}")))
            .include("filetransfer/c")
            .warnings(true)
            .compile("file_transfer_server");

        println!("cargo:rustc-link-lib=ws2_32");
    }

    tauri_build::build()
}
