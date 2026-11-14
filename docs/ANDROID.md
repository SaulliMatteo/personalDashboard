# Android

Interfaccia del telefono (layout compatto, dashboard a pagine, fogli): `docs/MOBILE.md`. Notifiche
pianificate e tocco sulle notifiche: `docs/NOTIFICHE.md`. Permessi, backup e archivio della sessione visti dal lato
della sicurezza: `docs/SICUREZZA.md`.

## Build

- `npx tauri android dev`; per l'emulatore `npx tauri android build --debug --apk --target x86_64`. Servono
  `ANDROID_HOME`, `NDK_HOME` e un `JAVA_HOME` su una JDK che Gradle 8.14.3 supporti (21 o 23), **non** la JBR 25 di
  Android Studio: con quella Gradle si ferma su `A problem occurred configuring project ':buildSrc'. > 25.0.4`.
- APK vero (`it.matteo.personalDashboard`, senza `.debug`): `npm run android:release` (arm64, R8 attivo), firmato con
  la chiave dell'utente che sta fuori dal repo e indicata da `gen/android/keystore.properties` (ignorato da git;
  password anche in `PD_STORE_PASSWORD`/`PD_KEY_PASSWORD`, vedi `app/build.gradle.kts`). La chiave c'è già
  (`%USERPROFILE%\.android-keys`, con una copia di `keystore.properties`): **mai ricrearla né leggerne o stamparne la
  password**.
- `versionCode` lo calcola Tauri da `version` di `tauri.conf.json` (1.0.3 -> 1000003): alzarla a ogni APK.
- L'app debug è `it.matteo.personalDashboard.debug`: un'app separata con i suoi dati.
- Questo progetto è versionato (manifest, Gradle e icone si modificano qui); ciò che Tauri rigenera a ogni build lo
  escludono i suoi `.gitignore`. Capability: `capabilities/default.json` solo desktop, `mobile.json` per Android.

## App

- Icona: `res/mipmap-*` dall'icona del desktop (`tauri icon` per le legacy; il primo piano adattivo è `icon.png` al 60%
  su sfondo `#120E1B`, fatto a mano).
- Permessi nel manifest con il loro perché; `RECEIVE_BOOT_COMPLETED` e `WAKE_LOCK` del plugin delle notifiche sono
  tolti (`tools:node="remove"`): il ripristino dopo il riavvio della 2.4.0 non funziona (`batch` salva `sourceJson`
  vuoto).
- Backup automatico di Android: solo `dashboard.db` (`res/xml/backup_rules.xml` e `data_extraction_rules.xml`); la
  copia completa è Impostazioni > Generale > Dati (vedi `docs/BACKEND.md`). Il FileProvider espone solo la
  cartella del Quaderno.
- La pagina gira da `http://tauri.localhost` e il DB sta in `/data/data/<id>/dashboard.db` (si legge con
  `adb exec-out run-as`).
- Deep link in `tauri.android.conf.json` (`plugins.deep-link.mobile`).

## Plugin nativi locali (`src-tauri/plugins/`)

- **secure-store**: i comandi `secure_store_*` della sessione dei Gruppi su Android passano qui (Kotlin: chiave
  AES-256-GCM nell'Android Keystore, valori cifrati in `noBackupFilesDir`), mai in SQLite o `localStorage`.
- **file-open**: aprire/condividere un file del Quaderno con i comandi `file_open`/`file_share` (FileProvider), solo per
  file dentro il vault. Il vault (`documentDir()/Notes`) è `Android/data/<id>/files/Documents/Notes` (niente permessi, si
  cancella con la disinstallazione); il selettore file e l'esportazione danno URI `content://` (il plugin fs li apre da
  solo, il nome vero con `basename()`). Le differenze di piattaforma stanno in `widgets/notes/data/filesApi.ts` (con
  `core/system/platform.ts`), non nei componenti.

## `MainActivity.kt` → frontend

- Uscite dall'app (stop automatico dello Studio): manda `pd-away` (uscita, rientro, tempo a schermo acceso fuori
  dall'app), letto solo da `core/system/androidAway.ts`.
- Barre di sistema e tastiera: la WebView in `env(safe-area-inset-*)` dà solo il foro della fotocamera, quindi
  `MainActivity.kt` le manda a `core/system/androidInsets.ts`; nei CSS si usano `--safe-top|right|bottom|left` e
  `--keyboard` (`styles/base.css`), e `:root[data-keyboard]` quando la tastiera è aperta.
- Tocco su una notifica: legge l'id dall'intent e lo passa a `core/system/androidTaps.ts` (anche all'avvio a freddo).
- Indietro di Android: `NavProvider` (vista → dashboard) e `useBackHandler` di `core/nav/backHandlers.ts` per chi ha
  qualcosa da chiudere (menu, modifica, pannello del Quaderno, conferma della Lavagna). Prima ancora,
  `core/nav/overlays.ts` chiude lo schermo intero o il dialogo/menu in cima mandandogli Esc. Uno "schermo intero" fatto
  con una classe (Lavagna) non lo vede `overlays.ts`: serve un suo `useBackHandler`.
