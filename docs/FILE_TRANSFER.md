# Widget File Transfer

Riceve file dall'iPad via Wi-Fi: il PC avvia un piccolo server HTTP, l'iPad apre l'indirizzo
(o scansiona il QR) e carica i file.

```
iPad ──HTTP──▶ server C (Winsock) ──▶ cartella "received"
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
├─ build.rs                       compila i .c con la crate `cc` (solo target Windows)
├─ filetransfer/
│   ├─ c/                         network.c, http.c, httpserver.c (+ .h): il server
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
(il pulsante "Apri cartella" nella pagina la apre in Esplora file).

## Aggiornare la pagina web dell'iPad

Dopo aver modificato `FileTransfer/web/src`, compila con `sync-web.bat` del progetto originale e
copia il contenuto di `FileTransfer/server/public/` in `src-tauri/filetransfer/public/`.

## Limiti

- Il server C usa Winsock: funziona solo su Windows. Sugli altri sistemi l'app si compila e il
  widget mostra l'errore "supportato solo su Windows" se si prova ad avviarlo.
- Se Windows chiede il permesso del firewall al primo avvio del server, va concesso alle reti private:
  senza, l'iPad non riesce a collegarsi.
