# Backend nativo (src-tauri)

Regole generali (ACL dei comandi, `is_app_url`, CSP, difese del C di File Transfer) nel `CLAUDE.md` principale.
Android: `gen/android/CLAUDE.md`.

## Moduli

`src/lib.rs` registra i plugin (sql, notification, fs/dialog/opener usati dal Quaderno, log in debug) e i comandi, e
crea la finestra `main`.

- **File Transfer**: server HTTP in C (`filetransfer/c/`; Winsock su Windows, socket POSIX su macOS/Linux, tutte le
  differenze in `platform.h`), compilato da `build.rs` con `cc` (che imposta `cfg(ft_native)`), esposto con i comandi
  `ft_*` di `src/file_transfer.rs`; va fermato alla chiusura della finestra. Su macOS la 5000 è di AirPlay: il server
  prova le porte successive. Su Android il server non c'è e il widget **invia** al PC (`src/file_send.rs`,
  `ft_check_target`/`ft_send_file`; frontend `FileSendContext.tsx`/`FileSendDetail.tsx`, ruolo scelto in
  `data/fileSendApi.ts`): stessa richiesta della pagina dell'iPad, senza `Origin`. Dettagli in `docs/FILE_TRANSFER.md`.
- **Companion (Pixy)**: `companion_snapshot` in `src/companion.rs` (inattività, app in primo piano e descrizione
  dell'eseguibile via `windows-sys`; su macOS inattività da CoreGraphics e app via `NSWorkspace`, con il bundle `.app`
  come "processo" e titolo vuoto). Lato frontend la catena è `core/system/appCategory.ts` (classifica l'app; con
  `core/system/systemApi.ts` serve anche allo stop automatico dello Studio, `study/timer/autoStop.ts`) →
  `engine/brain.ts` (sceglie la posa, puro) → `core/pixy/engine/poses.ts` (com'è fatta, con varianti per personalità) →
  `core/pixy/engine/animator.ts` (fotogrammi) → `core/pixy/render/` (campo SDF della faccia + costumi; LED in Fosforo,
  pieno negli altri temi), disegnati da `core/pixy/PixyFace.tsx`. Motore e disegno stanno in `core/pixy` perché li usano
  anche i Gruppi (i Pixy dei compagni nella Stanza comune); il cervello resta nel widget.
- **Notifiche con immagine** (Windows): comando `notify_with_image` (`src/notify.rs`, `tauri-winrt-notification`),
  chiamato solo da `core/notify/notifyApi.ts`. Resto in `src/core/notify/CLAUDE.md`.
- **Esporta/Importa i dati**: `core/db/backup.ts` + `src/db_backup.rs` (`VACUUM INTO`, import con controllo di
  intestazione e `user_version`, DB chiuso e pagina ricaricata; restano i `cloud_device_id:*` del dispositivo).
- **Sessione dei Gruppi** (`src/secure_store.rs`): su Windows nel Credential Manager a pezzi (limite di 2560 byte per
  voce); su macOS **non nel Keychain** ma in un file per chiave in `<dati dell'app>/sessione/` (cartella 700, file 600,
  scrittura atomica con rinomina): senza Team ID ogni aggiornamento è un'altra app per il Keychain e la richiesta della
  password, se annullata, fa perdere la sessione (provato con 1.0.7 → 1.0.8). È una scelta dell'utente: meno protetta
  del Keychain (la legge qualsiasi processo dell'utente), ma senza richieste. Le voci delle versioni fino alla 1.0.9
  (servizi `<identifier>` e `<identifier>.sessione`) non si leggono né si cancellano: farebbero comparire la richiesta.
  Non tornare al Keychain su Mac senza un Team ID di Apple. Su Android: plugin `plugins/secure-store`.

## macOS

- L'app installata serve il frontend da `http://localhost:14321` (`tauri-plugin-localhost`, `src/lib.rs`): da
  `tauri://localhost` YouTube rifiuta il player (errore 153, niente referrer). La porta è anche in
  `capabilities/default.json` (`remote.urls`, senza la pagina perde l'IPC): cambiarla in entrambi i posti. Per Tauri
  quella è un'origine remota, quindi anche i comandi dell'app passano dall'ACL (altrimenti vengono rifiutati, e il
  portachiavi risulta "non disponibile").
- `on_navigation` vede anche le navigazioni degli iframe: un iframe nuovo da un altro host va in `is_embed_url`,
  altrimenti viene annullato e aperto nel browser.
- Il codice macOS non si compila da Windows: lo prova solo la CI della release o un Mac.

## Aggiornamenti

`core/updater/`, `src/updater.rs`. Su Windows `install` chiude il processo con `std::process::exit` senza
`CloseRequested` né `RunEvent::Exit`: ciò che va fermato alla chiusura (oggi il server di File
Transfer) va fermato anche in `updater_prepare_install`, chiamato prima di `install`; il riavvio su macOS
(`relaunch`) passa invece da `RunEvent::Exit` in `src/lib.rs`. La chiave pubblica in `plugins.updater.pubkey` non si
cambia più: le app installate accettano solo pacchetti firmati con la privata corrispondente (Secret
`TAURI_SIGNING_PRIVATE_KEY`); persa quella, chi ha l'app deve reinstallarla a mano. Con `createUpdaterArtifacts`
anche `npm run tauri build` in locale vuole `TAURI_SIGNING_PRIVATE_KEY` nell'ambiente.

## Release

- `.github/workflows/release.yml` (tag `v*` o avvio manuale) compila `.dmg` universale + installer Windows in una
  Release in bozza. Il build per macOS si fa solo su un Mac o in CI.
- macOS firmato in CI con un certificato **autofirmato** (niente account Apple; Secrets `MACOS_CERTIFICATE` = `.p12` in
  base64 e `MACOS_CERTIFICATE_PASSWORD`, CN `personalDashboard Self-Signed`): lo sblocco al primo avvio resta
  (istruzioni nel README). La firma resta uguale tra le versioni, ma **non basta al Keychain** (vedi la sessione dei
  Gruppi sopra). Il certificato non si cambia (vale 10 anni); `"-"` in `tauri.conf.json` resta solo per le build
  locali. La CI si ferma se mancano i Secrets o se la firma esce ad-hoc.
- La versione ha una sola fonte, `package.json` (`tauri.conf.json` ha `"version": "../package.json"`); `Cargo.toml` va
  tenuto uguale a mano (la CI si ferma se non coincide, o se il tag non è `v<versione>`).
- Per pubblicare: `npm version X.Y.Z --no-git-tag-version` + `version` in `src-tauri/Cargo.toml`, commit, poi
  `git tag vX.Y.Z && git push --tags` (oppure Actions › Release › Run workflow); finito, scrivi le note e pubblica la
  bozza: `release-notes.yml` copia il testo della release nel campo `notes` di `latest.json` (quello che l'app mostra).
- I valori dei Gruppi la CI li legge dai Secrets `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (senza, la build esce in
  solo locale), la firma degli aggiornamenti da `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  (senza, la build si ferma).
- Installer Windows (NSIS): `windows/hooks.nsh` (`bundle.windows.nsis.installerHooks`) dopo l'installazione avvisa
  Explorer (`SHChangeNotify`), altrimenti dopo un aggiornamento l'app fissata sulla barra resta un quadrato bianco.
- Le notifiche mostrano il nome dell'app solo nella versione installata; in `tauri dev` Windows le attribuisce a
  PowerShell.

## Versioni pinnate

`tauri` è `=2.11.3`. Le versioni successive dei plugin richiedono `tauri ^2.12`, quindi restano fissate (controllare
il manifesto su crates.io prima di aggiornarle):
- `tauri-plugin-notification` `=2.4.0` (e `tauri-winrt-notification` `=0.8.1`, la versione che usa);
- `tauri-plugin-localhost` `=2.3.1`;
- `tauri-plugin-deep-link` `=2.4.10` (anche npm);
- `tauri-plugin-single-instance` `=2.4.5`;
- `tauri-plugin-updater` `=2.12.0` e `tauri-plugin-process` `=2.3.1`, con le stesse versioni esatte su npm
  (`@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`).
