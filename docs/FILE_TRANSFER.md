# Widget File Transfer

Riceve file dall'iPad via Wi-Fi: il PC avvia un piccolo server HTTP, l'iPad apre l'indirizzo
(o scansiona il QR) e carica i file.

```
iPad ──HTTP──▶ server C (Winsock / POSIX) ──▶ cartella "received"
                    ▲
                    │ chiamate dirette (FFI)
              src-tauri/src/file_transfer.rs   (comandi ft_*)
                    ▲
                    │ invoke()
              widgets/filetransfer/            (widget + pagina di dettaglio)
```

## Dove sta cosa

```
src-tauri/
├─ build.rs                       compila i .c con la crate `cc` (Windows, macOS, Linux) e imposta cfg(ft_native)
├─ filetransfer/
│   ├─ c/                         network.c, http.c, httpserver.c (+ .h): il server;
│   │                             platform.h = unico punto con #ifdef _WIN32 (socket, thread, mkdir)
│   └─ public/                    pagina web per l'iPad (build di FileTransfer/web)
└─ src/file_transfer.rs           comandi Tauri: ft_start_server, ft_stop_server, ft_status,
                                  ft_list_files, ft_read_preview, ft_open_folder
src/widgets/filetransfer/
├─ index.ts                       WidgetDefinition (taglie 2×1, 1×1, 2×2; provider; dettaglio)
├─ FileTransferContext.tsx        stato condiviso: server, indirizzo, file (polling 2 s se acceso)
├─ FileTransferWidget.tsx/.css    widget in dashboard
├─ FileTransferDetail.tsx/.css    pagina: server + QR, file ricevuti, anteprima
├─ data/fileTransferApi.ts        UNICO punto con invoke()
└─ lib/format.ts
```

## Dati

I file ricevuti stanno nella cartella dati dell'app, sotto `file-transfer/received`
(il pulsante "Apri cartella" nella pagina la apre in Esplora file o nel Finder).

## Aggiornare la pagina web dell'iPad

Dopo aver modificato `FileTransfer/web/src`, compila con `sync-web.bat` del progetto originale e
copia il contenuto di `FileTransfer/server/public/` in `src-tauri/filetransfer/public/`.

## Limiti

- Il server C funziona su Windows (Winsock), macOS e Linux (socket POSIX + pthread). Sugli altri sistemi
  l'app si compila e il widget mostra un errore se si prova ad avviarlo.
- La porta è 5000; se è occupata il server prova fino alla 5009 e mostra quella reale. Su macOS la 5000
  è quasi sempre di AirPlay Receiver (Impostazioni › Generali › AirDrop e Handoff).
- Su macOS stop e disconnessioni: `shutdown()` prima di `close()` per sbloccare `accept()`, e
  `SO_NOSIGPIPE` perché un iPad che chiude a metà non uccida l'app.
- Se Windows chiede il permesso del firewall al primo avvio del server, va concesso alle reti private
  (su macOS: "Consenti" alle connessioni in entrata; con la firma ad-hoc può richiederlo a ogni aggiornamento):
  senza, l'iPad non riesce a collegarsi.
