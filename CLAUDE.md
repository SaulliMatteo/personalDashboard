# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dashboard personale **local-first** per desktop: Tauri v2 + React 19 + Vite + TypeScript + Tailwind v4,
dati in SQLite locale (`@tauri-apps/plugin-sql`, file `dashboard.db`). Codice, commenti e UI sono in **italiano**.
Documentazione di dettaglio: `docs/ARCHITETTURA.md` (mappa, regole, ricette) e `docs/FILE_TRANSFER.md`.
`docs/` (documentazione, mockup, prompt) è **solo locale**: è nel `.gitignore` e fuori dalla cronologia del repo
pubblico, come `CLAUDE.local.md`. Il `README.md` è per chi scarica l'app (installazione, dati, privacy), non per chi
sviluppa: le note per lo sviluppo stanno qui.

## Comandi

```bash
npm install
npm run tauri dev      # sviluppo (finestra Tauri, compila anche Rust e C)
npm run tauri build    # installer
npm run build          # tsc -b + vite build: è il controllo dei tipi
npm run lint           # oxlint (plugin react/typescript/oxc, vedi .oxlintrc.json)
cd src-tauri && cargo check   # dopo modifiche a Rust o C
```

Servono Node (LTS), Rust e i prerequisiti di Tauri v2 per il sistema.
Android (`npx tauri android dev` / `npx tauri android build --debug --apk --target x86_64` per l'emulatore): servono
`ANDROID_HOME`, `NDK_HOME` e un `JAVA_HOME` su una JDK che Gradle 8.14.3 supporti (21 o 23), **non** la JBR 25 di
Android Studio: con quella Gradle si ferma su `A problem occurred configuring project ':buildSrc'. > 25.0.4`.
APK vero (`it.matteo.personalDashboard`, senza `.debug`): `npm run android:release` (arm64, R8 attivo), firmato con la
chiave dell'utente che sta fuori dal repo e indicata da `gen/android/keystore.properties` (ignorato da git; password
anche in `PD_STORE_PASSWORD`/`PD_KEY_PASSWORD`, vedi `app/build.gradle.kts`). La chiave c'è già (`%USERPROFILE%\.android-keys`, con
una copia di `keystore.properties`): mai ricrearla né leggerne o stamparne la password. `versionCode` lo calcola Tauri da `version` di `tauri.conf.json` (1.0.3 -> 1000003): alzarla a ogni APK.
Icona: `res/mipmap-*` dall'icona del desktop (`tauri icon` per le legacy; il primo piano adattivo è `icon.png` al 60%
su sfondo `#120E1B`, fatto a mano). Permessi nel manifest con il loro perché; `RECEIVE_BOOT_COMPLETED` e `WAKE_LOCK` del
plugin delle notifiche sono tolti (`tools:node="remove"`): il ripristino dopo il riavvio della 2.4.0 non funziona
(`batch` salva `sourceJson` vuoto). Backup automatico di Android: solo `dashboard.db` (`res/xml/backup_rules.xml` e
`data_extraction_rules.xml`); la copia completa è Impostazioni > Generale > Dati (`core/db/backup.ts` +
`src/db_backup.rs`: `VACUUM INTO`, import con controllo di intestazione e `user_version`, DB chiuso e pagina
ricaricata; restano i `cloud_device_id:*` del dispositivo). Il FileProvider espone solo la cartella del Quaderno.
Il progetto `src-tauri/gen/android` è versionato (manifest, Gradle e icone si modificano lì); ciò che Tauri rigenera a
ogni build lo escludono i suoi `.gitignore`. Capability: `capabilities/default.json` solo desktop, `mobile.json` per
Android. Su Android la pagina gira da `http://tauri.localhost` e il DB sta in `/data/data/<id>/dashboard.db`
(app debug: `it.matteo.personalDashboard.debug`, un'app separata con i suoi dati; si legge con `adb exec-out run-as`).
Sessione dei Gruppi su Android: i comandi `secure_store_*` passano al plugin locale `src-tauri/plugins/secure-store`
(Kotlin: chiave AES-256-GCM nell'Android Keystore, valori cifrati in `noBackupFilesDir`), mai in SQLite o
`localStorage`. Il deep link per Android è in `tauri.android.conf.json` (`plugins.deep-link.mobile`).
Quaderno su Android: il vault (`documentDir()/Notes`) è `Android/data/<id>/files/Documents/Notes` (niente permessi, si
cancella con la disinstallazione); il selettore file e l'esportazione danno URI `content://` (il plugin fs li apre da
solo, il nome vero con `basename()`); aprire/condividere un file passa dal plugin locale `src-tauri/plugins/file-open`
(FileProvider) con i comandi `file_open`/`file_share`, solo per file dentro il vault. Le differenze di piattaforma stanno
in `widgets/notes/data/filesApi.ts` (con `core/system/platform.ts`), non nei componenti.
Editor del Quaderno sul telefono (mockup `docs/design/mobile/quaderno.html`): `NoteEditor` con `useCompact()` disegna
un'altra disposizione (nota fissa sopra la pagina, ← titolo ☆ ⋯, una riga di strumenti sopra la tastiera, il resto in
`components/BottomSheet.tsx`); i pezzi in comune col desktop (esporta, pagine, colori…) sono variabili usate da
entrambe, e un comando nuovo va messo in tutte e due. Con un foglio aperto il testo ha `inputmode="none"`, altrimenti
Android riapre la tastiera al tocco su un pulsante.
Layout del telefono (mockup `docs/design/mobile/viste.html`): è "compatto" quando il lato corto della finestra è sotto i
600 dp (`core/layout/useCompact.ts`, l'unica definizione; AppShell mette `data-compact` su `<html>` e i CSS usano
`:root[data-compact]`). Tablet e desktop restano nel layout desktop. Sul telefono: sidebar come menu a scomparsa, barra in
alto `ui/CompactBar` (titolo e ← della pagina; i `.dashboard-header` dei dettagli nascondono titolo e BackButton),
dashboard `features/dashboard/MobileDashboard.tsx` a pagine 2×4 (4×2 in orizzontale) con i widget scalati con `zoom`.
Il suo layout è separato: tabella `dashboard_layout_mobile` (`core/layout/mobileLayout.ts` puro, prova
`scripts/layout/mobileLayout.test.mts`), mai scritto su `dashboard_layout`; il catalogo passa da
`features/settings/catalog/useCatalogLayout.ts`. Impostazioni solo desktop: `desktopOnly` in `SETTING_DEFS`;
solo dove ci sono i segnali di sistema (app in primo piano, Windows e macOS): `systemSignals`; testi diversi su Android:
`android: { label, description }`. Uscite dall'app su Android (stop automatico dello Studio): `MainActivity.kt` manda
`pd-away` (uscita, rientro, tempo a schermo acceso fuori dall'app), letto solo da `core/system/androidAway.ts`.
Barre di sistema e tastiera: la WebView in `env(safe-area-inset-*)` dà solo il foro della fotocamera, quindi
`MainActivity.kt` le manda a `core/system/androidInsets.ts`; nei CSS si usano `--safe-top|right|bottom|left` e
`--keyboard` (`styles/base.css`), e `:root[data-keyboard]` quando la tastiera è aperta. Indietro di Android: `NavProvider` (vista → dashboard) e `useBackHandler` di
`core/nav/backHandlers.ts` per chi ha qualcosa da chiudere (menu, modifica, pannello del Quaderno, conferma della Lavagna).
Prima ancora, `core/nav/overlays.ts` chiude lo schermo intero o il dialogo/menu in cima mandandogli Esc: un dialogo o
menu nuovo deve avere `role="dialog"`/`aria-modal`/`role="menu"` e chiudersi con Esc, altrimenti l'indietro cambia vista.
Tocco (anche tablet): ciò che compare solo passando col mouse va mostrato anche in `@media (hover: none)`; le aree
toccabili sotto i 44px si allargano con un `::after` invisibile e `inset: var(--hit)` dentro `@media (pointer: coarse)`
(niente cambi d'aspetto); le scorciatoie da tastiera non si suggeriscono con `useTouchOnly()` (`core/layout/useCompact.ts`).
Col dito si trascina solo dopo una pressione lunga (dashboard del telefono, Note, tabellone, griglia desktop sul tablet
con `features/dashboard/useLongPressGridDrag.ts`): un tocco apre, uno scorrimento scorre.
Leggibilità sul telefono (mockup `docs/design/mobile/ritocchi.html`): i caratteri piccoli delle pagine si scrivono
`max(Npx, var(--fs-min))` (o `max(0.8em, var(--fs-min))`): `--fs-min` è 0 fuori dal telefono e 13px con `data-compact`
(card e mini della dashboard escluse, sono scalate). Sul telefono i dialoghi diventano fogli dal basso con la regola in
`styles/base.css` (un dialogo nuovo va aggiunto alle sue liste di overlay/dialogo/azioni), i `.nq-menu` del Quaderno
anche (`noteEditor.css`). Stanza comune in verticale: `RoomScene layout="column"` (sala a grandezza vera, 8 posti) e
`RoomSidePanel sheet` (schede in un foglio con la maniglia o trascinandolo, chiuso dall'indietro). La WebView di
Android non conosce `scrollbar-width`: una barra di scorrimento stilizzata con `::-webkit-scrollbar` va tolta a mano
sul telefono (come `.main` in `app/shell.css`). Uno "schermo intero" fatto con una classe (Lavagna) non lo vede
`overlays.ts`: serve un suo `useBackHandler`.
Non c'è un test runner né la CI di test: si verifica con `npm run build` + `npm run lint` (+ `cargo check`), più le
prove dei Gruppi qui sotto quando si toccano `social/`, `core/cloud/` o `supabase/`, quella dei consigli YouTube
(`scripts/youtube/recommender.test.mts`) quando si tocca `widgets/youtube/lib/recommender.ts` e
`node scripts/layout/mobileLayout.test.mts` quando si tocca `core/layout/mobileLayout.ts`, `node scripts/study/phases.test.mts`
quando si tocca `widgets/study/timer/phases.ts`, `scripts/sync/records.test.mts`, `scripts/sync/schema.test.mts` (questa
su SQLite vero con `node:sqlite`, tutte le migrazioni da zero) e `scripts/sync/round.test.mts` (due dispositivi su SQLite
vero e un server finto) quando si tocca `core/sync/` o una tabella sincronizzata, `node scripts/sync/files.test.mts`
quando si tocca `widgets/notes/sync/filePlan.ts`.

```bash
# Prove pure (scripts/gruppi/<nome>.test.mts e scripts/youtube/<nome>.test.mts, nessun server); una alla volta:
npx rolldown scripts/gruppi/chat.test.mts --file node_modules/.tmp/gruppi-chat.test.mjs --platform node
node node_modules/.tmp/gruppi-chat.test.mjs
npx rolldown scripts/youtube/recommender.test.mts --file node_modules/.tmp/youtube-recommender.test.mjs --platform node
node node_modules/.tmp/youtube-recommender.test.mjs
# Server dei Gruppi (Supabase locale, serve Docker): migrazioni in supabase/migrations/, test pgTAP in
# supabase/tests/database/ (helper condivisi in _aiuti.psql)
npx supabase start
npx supabase db reset      # riapplica le migrazioni da zero
npx supabase test db       # tutti i file pgTAP
```

Su Windows le porte 5432x di Supabase locale possono cadere nell'intervallo riservato da `winnat` ("bind forbidden"):
`net stop winnat` + `net start winnat` da amministratore.
Le logiche "pure" (es. `widgets/companion/engine/`, `core/pixy/engine/`, `widgets/youtube/lib/watchTracker.ts`, `core/layout/compactor.ts`)
hanno orologio e random iniettati apposta per poter essere testate senza browser: uno script `.mts` lanciato con
`node` (Node 24 toglie i tipi da solo) può importarle direttamente; se importano altri file senza estensione, prima
si fa un bundle con `npx rolldown`.
Il DB reale è `dashboard.db` nella cartella dati dell'app (Windows: `%APPDATA%\it.matteo.personalDashboard\`), lo
stesso in dev e nell'app installata: se l'installata è aperta lo blocca, chiuderla prima di `npm run tauri dev`.

## Architettura d'insieme

**Albero di avvio** (`src/app/App.tsx`): `DatabaseGate` (esegue le migrazioni, non monta nulla prima) →
`SettingsProvider` → `LayoutProvider` → `BootGate` (tiene la splash di `index.html` finché il layout non è pronto)
→ `CloudProvider` (account dei Gruppi, inerte senza configurazione) → `SocialProviders` (gruppi e moduli social)
→ `WidgetProviders` (monta i `provider` di tutti i widget, sempre attivi anche se il widget non è in dashboard)
→ `NavProvider` → vista corrente. Non c'è un router: la vista (`AppView` in `core/nav/useNav.ts`) è
`dashboard` | `catalog` | `settings` (pagina Impostazioni, `openSettings(sezione)`) | `widgetDetail` | `room`
(Stanza comune dei Gruppi, `social/room/`), e la pagina di dettaglio è il `detailComponent` del widget.

**Tutto è guidato dal registry.** `src/widgets/registry.ts` è l'unico elenco dei widget; ogni widget esporta una
`WidgetDefinition` (`core/widgets/types.ts`: taglie, `defaultPlacement`, `detailComponent`, `provider`,
`settingsGroup`, `mini`). Catalogo (che è anche Impostazioni > Widget: la rotellina di una card apre il suo
`settingsGroup`), dashboard, layout di default, provider e scelte degli spazi in alto a destra dell'intestazione
(`mini`, `features/dashboard/HeaderSlots.tsx`) e comandi nell'intestazione della Stanza comune (`roomControls`, raccolti
in `app/App.tsx` e passati a `RoomPage`: così `social` non importa i widget) derivano da lì:
aggiungere un widget = cartella `src/widgets/<nome>/` + una riga nel registry.

**Regole di dipendenza**: `app → features, widgets, social, core`; `features → core, widgets/registry, ui`;
`widgets/<nome> → core, ui` (mai un altro widget); `social → core, ui` (i Gruppi, `src/social/`: legge i widget solo dal
bus e dal DB in sola lettura); `widgets/registry → social` solo per registrare il widget Gruppi; `ui →` niente.
Le voci che `features` non può importare (es. "Stanza comune" nella barra laterale) gliele passa `app/`.
Moduli dei Gruppi: `social/registry.ts` è il loro unico elenco (ricetta in `docs/ARCHITETTURA.md`). I widget comunicano tramite
`core/activity/activityBus.ts`: **stato** (`publishActivity`, sovrascrivibile) ed **eventi** (`emitActivityEvent`,
momentanei), solo in memoria. Il Companion ascolta il bus per reagire a ciò che fanno gli altri widget.
Debito noto: `widgets/youtube/screens/WatchScreen.tsx` importa `study/data/studyRepository.ts` — non replicarlo.

**Dati**:
- SQL solo nei `*Repository.ts` (es. `widgets/study/data/studyRepository.ts`); i componenti non scrivono SQL.
- Schema: migrazioni versionate in `core/db/migrations.ts`, solo **aggiunte in fondo** (`version` = ultima + 1),
  idempotenti (`IF NOT EXISTS`, `INSERT OR IGNORE`); mai modificare una migrazione rilasciata. Il runner
  (`core/db/index.ts`) guarda solo `PRAGMA user_version`: due rami che usano lo stesso numero si scontrano al merge, e
  un DB già passato da quel numero salta l'altra migrazione. Si rinumera la parte non rilasciata e si aggiunge una
  migrazione di "riparazione" che riesegue quella saltata (es. la v16).
- Impostazioni: `core/settings/schema.ts` è l'unica fonte (`DEFAULT_SETTINGS` + `SETTING_DEFS`; il controllo in UI
  compare da solo). Righe chiave/valore, niente migrazioni; valori non validi tornano al default (`sanitizeSettings`).
  Se le opzioni dipendono dal registry (che `core` non può importare) la chiave è `text` nello schema e la pagina
  passa a `SettingsSection` un `overrides` con il select (es. `headerSlot1/2` in `tabs/DashboardTab.tsx`).
- Metadati interni dell'app: store chiave/valore `core/db/meta.ts`, non le impostazioni.
- Sync tra dispositivi (`core/sync/`, in corso sul ramo `feat/sync`): le tabelle sincronizzate (`SYNC_TABLES` in
  `core/sync/tables.ts`: Studio, Note, Raccolte, impostazioni) hanno trigger SQLite (migrazione 23) che danno a ogni riga
  un id globale (`sync_map`) e segnano le righe cambiate (`sync_outbox`); tacciono con `sync_state.applying = 1`. Una
  colonna nuova in una di quelle tabelle va aggiunta ai trigger (migrazione nuova con DROP/CREATE TRIGGER) e in
  `tables.ts`, altrimenti non viaggia (`schema.test.mts` lo segnala). Nei trigger niente `OR IGNORE`/`OR REPLACE`: con un
  UPSERT esterno SQLite non li rispetta. Gli id locali dentro i contenuti (`data-view`, `data-ref-row`, campi delle
  righe e delle viste) li traduce `core/sync/engine/records.ts`: un riferimento nuovo a un id va aggiunto lì.
  Impostazioni del singolo dispositivo: `PER_DEVICE_SETTINGS` in `core/settings/schema.ts`.
  Il giro (`core/sync/engine/round.ts`, puro: pull per `seq`, poi push del registro) lo fa partire `SyncProvider`
  (`core/sync/SyncContext.tsx`, solo con l'account pronto e `syncEnabled`), l'SQL sta tutto in `core/sync/syncRepository.ts`
  e la rete in `core/cloud/syncApi.ts` (server: `supabase/migrations/…_sync.sql`, righe leggibili solo dal proprio utente).
  Le scritture del sync tengono i trigger accesi e tolgono subito la loro voce dal registro (il flag `applying` serve
  solo a "Usa i dati del cloud"). Chi tiene in memoria righe sincronizzate le rilegge con `onSyncApplied`
  (`core/sync/syncEvents.ts`, come fanno impostazioni e timer dello Studio; le Note passano da
  `widgets/notes/sync/NotesSyncProvider.tsx`, che toglie le cartelle su disco delle note cancellate, ricalcola segni e
  copia su disco e poi avvisa pagina, card e mini con `lib/remoteChanges.ts`). I tipi accesi sono `SYNC_KINDS` in
  `core/sync/syncSetup.ts`: uno nuovo entra nel registro da solo al primo giro. I totali dei Gruppi contano solo le
  sessioni con `origin_device` NULL (fatte qui).
  File (allegati, immagini e PDF delle pagine, campi File delle raccolte): non sono righe, li muove
  `widgets/notes/sync/fileSync.ts` dopo ogni giro (registrato con `registerSyncTask` di `core/sync/syncTasks.ts`) nel
  bucket privato `sync-files` (`<user_id>/<note|collection>/<uid>/<nome in base64url>`, rete solo in
  `core/cloud/syncFilesApi.ts`). Cosa caricare, scaricare o togliere lo decide `filePlan.ts` (puro) dalle righe che li
  citano e da `sync_files` (migrazione 24: i file già sia qui sia nel cloud). Un riferimento nuovo a un file va in
  `listFileReferences` di `notesRepository.ts`. Lo Storage non si svuota da SQL: `deleteAccount` cancella prima i file.

**Backend nativo** (`src-tauri/`): `src/lib.rs` registra plugin (sql, notification, fs/dialog/opener usati dal
Quaderno, log in debug) e comandi, e crea la finestra `main` (in `tauri.conf.json` ha `create: false`).
- File Transfer: server HTTP in C (`filetransfer/c/`; Winsock su Windows, socket POSIX su macOS/Linux, tutte le
  differenze in `platform.h`), compilato da `build.rs` con `cc` (che imposta `cfg(ft_native)`), esposto con i comandi
  `ft_*` di `src/file_transfer.rs`; va fermato alla chiusura della finestra. Su macOS la 5000 è di AirPlay: il server
  prova le porte successive.
  È esposto sulla rete locale senza autenticazione (la pagina dell'iPad non si può cambiare), quindi le difese stanno
  tutte nel C (`http.c`) e non vanno tolte: niente header CORS e `Origin` uguale a `http://<Host>` (un sito aperto nel
  browser non può caricare file), `Host` solo IPv4 o `localhost` (DNS rebinding), `X-File-Name` obbligatorio (niente
  richieste "semplici" senza preflight), nomi di file sicuri (anche quelli riservati di Windows), mai sovrascrivere
  (`"wbx"`, poi "nome (1).ext"), file a metà cancellati, al massimo 64 GB, 32 connessioni e 30 s di silenzio.
  Su Android il server non c'è e il widget **invia** al PC (`src/file_send.rs`, `ft_check_target`/`ft_send_file`;
  frontend `FileSendContext.tsx`/`FileSendDetail.tsx`, ruolo scelto in `data/fileSendApi.ts`): stessa richiesta della
  pagina dell'iPad, senza `Origin`. Il comando accetta solo URI `content://` del selettore e IPv4 privati: non deve
  poter mandare file dell'app né uscire su internet scavalcando la CSP.
- Companion (Pixy): `companion_snapshot` in `src/companion.rs` (inattività, app in primo piano e descrizione
  dell'eseguibile via `windows-sys`; su macOS inattività da CoreGraphics e app via `NSWorkspace`, con il bundle `.app`
  come "processo" e titolo vuoto). Lato frontend la catena è `core/system/appCategory.ts` (classifica l'app; con
  `core/system/systemApi.ts` serve anche allo stop automatico dello Studio, `study/timer/autoStop.ts`) →
  `engine/brain.ts` (sceglie la posa, puro) → `core/pixy/engine/poses.ts` (com'è fatta, con varianti per personalità) →
  `core/pixy/engine/animator.ts` (fotogrammi) → `core/pixy/render/` (campo SDF della faccia + costumi; LED in Fosforo,
  pieno negli altri temi), disegnati da `core/pixy/PixyFace.tsx`. Motore e disegno stanno in `core/pixy` perché li usano
  anche i Gruppi (i Pixy dei compagni nella Stanza comune); il cervello resta nel widget.
- Notifiche: tutte da `core/notify/notifier.ts` (`sendAppNotification` con un `kind`), mai dal plugin direttamente.
  Il Companion registra un decoratore che le firma Pixy (faccia nello stile del tema, emoji, frase della personalità,
  `widgets/companion/notify/`); su Windows il toast con l'immagine lo mostra il comando `notify_with_image`
  (`src/notify.rs`, `tauri-winrt-notification`), altrove si ripiega sul plugin senza immagine.
  Su Android: un canale per tipo (`CHANNEL_OF`), il tocco apre la vista di `open` (scritta nell'ultima cifra dell'id:
  il plugin al tocco non riporta altro; `MainActivity.kt` legge l'id dall'intent e lo passa a
  `core/system/androidTaps.ts`, anche all'avvio a freddo; una vista nuova va in fondo a `OPEN_TARGETS`), e ciò che deve
  arrivare ad app congelata o chiusa si pianifica con `scheduleAppNotifications(gruppo, elenco)` (AlarmManager esatto,
  `USE_EXACT_ALARM` nel manifest; la chiusura forzata e il riavvio del telefono cancellano gli allarmi, li rimette la
  prossima apertura). Sul desktop la pianificazione non c'è (il plugin mostrerebbe subito). Timer dello Studio: lo stato
  è fatto di istanti (`runningSince`), le fine fase le calcola `widgets/study/timer/phases.ts` (puro, prova
  `node scripts/study/phases.test.mts`): al rientro si chiudono tutte le fasi finite nel frattempo, all'ora vera, e su
  Android le prossime sono già pianificate come notifiche (il tick JS è congelato a schermo spento).
- La finestra principale naviga solo dentro l'app (`on_navigation` + `is_app_url` in `src/lib.rs`): un link esterno
  (es. in una nota) si apre nel browser di sistema, mai nella webview che ha accesso ai comandi.
- Lato frontend, ogni widget chiama `invoke()` da un solo file `data/*Api.ts` (i segnali di sistema condivisi da
  `core/system/systemApi.ts`, le notifiche con immagine da `core/notify/notifyApi.ts`); allo stesso modo l'unica chiamata
  in rete (`fetch`) è `widgets/weather/data/weatherApi.ts`, e tutta la rete dei Gruppi (Supabase: HTTPS e WebSocket)
  passa solo da `core/cloud/`, l'unico file che importa `@supabase/supabase-js`.
- CSP in `tauri.conf.json` (`csp` per l'app installata, `devCsp` per `tauri dev`, che in più ammette Vite e lo stack
  Supabase locale): un dominio nuovo va aggiunto in entrambe. `style-src` ha `'unsafe-inline'` per gli stili inline di
  React, per questo Tauri non vi aggiunge nonce (`dangerousDisableAssetCspModification: ["style-src"]`).
- Sui sistemi non supportati (oggi: oltre Windows e macOS, il Companion su Linux) l'app deve compilare e i widget
  mostrano un errore chiaro.
- Release: `.github/workflows/release.yml` (tag `v*` o avvio manuale) compila `.dmg` universale + installer Windows
  in una Release in bozza. macOS firmato in CI con un certificato **autofirmato** (niente account Apple; Secrets
  `MACOS_CERTIFICATE` = `.p12` in base64 e `MACOS_CERTIFICATE_PASSWORD`, CN `personalDashboard Self-Signed`): lo
  sblocco al primo avvio resta (istruzioni nel README). La firma resta uguale tra le versioni, ma **non basta al
  Keychain**: senza Team ID (account Apple a pagamento, scartato) il Keychain riconosce l'app dall'hash del binario e
  chiede la password a ogni aggiornamento. Per questo su Mac la sessione dei Gruppi non sta nel Keychain (vedi
  `secure_store.rs` sotto). Il certificato non si cambia (vale 10 anni); `"-"` in `tauri.conf.json` resta solo per le
  build locali. La CI si ferma se mancano i Secrets o se la firma esce ad-hoc.
  La versione ha una sola fonte, `package.json` (`tauri.conf.json` ha `"version": "../package.json"`); `Cargo.toml` va
  tenuto uguale a mano (la CI si ferma se non coincide, o se il tag non è `v<versione>`).
  Per pubblicare: `npm version X.Y.Z --no-git-tag-version` + `version` in `src-tauri/Cargo.toml`, commit, poi
  `git tag vX.Y.Z && git push --tags` (oppure Actions › Release › Run workflow); finito, scrivi le note e pubblica la
  bozza: `release-notes.yml` copia il testo della release nel campo `notes` di `latest.json` (quello che l'app mostra).
  Il build per macOS si fa solo su un Mac o in CI, non da Windows. I valori dei Gruppi la CI li legge dai Secrets
  `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (senza, la build esce in solo locale), la firma degli aggiornamenti da
  `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (senza, la build si ferma).
  Installer Windows (NSIS): `src-tauri/windows/hooks.nsh` (`bundle.windows.nsis.installerHooks`) dopo l'installazione
  avvisa Explorer (`SHChangeNotify`), altrimenti dopo un aggiornamento l'app fissata sulla barra resta un quadrato bianco.

**Temi e stile**: 4 temi (`core/theme/themes.ts`), scelti con `data-theme` su `<html>`; ogni tema ridefinisce i
token di `src/styles/tokens.css` (colori, `--card-*`, `--panel-*`, `--radius-*`, `--font-display`, `--btn-*`…).
Ogni tema ha due varianti, giorno e notte (`data-mode`, impostazione `themeMode` con `auto` che segue il sistema):
cambiano solo i colori. La variante nativa sta in `tokens.css`, l'altra in `tokens-varianti.css` (un token nuovo va
in entrambi). Il codice legge il tema risolto con `useTheme()` (`mode`, `accent`…), mai `themeMode`.
Quando un pezzo cambia *forma* per tema si usa `useThemeVariant(map)` (`core/theme/variants.ts`), mai
`if (theme === …)`; le varianti-componente si rendono con `createElement` (lint `static-components`). Le card per
tema dei widget stanno in `card/cards.ts` e le pagine di dettaglio riusano la card M. In Opaco ogni widget ha un
pigmento (`data-pigment` sulla cella e su `.detail-scope`) che ridefinisce i token. Un `.css` accanto a ogni
componente, niente CSS globale fuori da `src/styles/`. `.main` in `AppShell` è l'unico elemento che scrolla, tranne
nella Stanza comune (`AppShell scroll={false}`): lì la pagina sta nella finestra e scorre solo la lista Membri.

## Regole

- Se non sei sicuro chiedi sempre conferme e chiarimenti, non cercare di indovinare a caso.
- Nessuna risorsa caricata da internet a runtime (font compresi: pacchetti `@fontsource` locali).
  Eccezioni, entrambe opzionali:
  - i dati del widget Meteo (Open-Meteo), solo se l'utente imposta la città e lo usa;
  - i Gruppi (Supabase, regione UE), solo se la build ha `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` e l'utente
    accede con Google. Senza, l'app resta solo locale ("Gruppi non configurati"); con il server irraggiungibile
    funziona tutto il resto. Tutta questa rete passa da `core/cloud/`. Segreti mai nel repo: vedi `docs/GRUPPI.md`;
  - gli aggiornamenti dell'app (`latest.json` e pacchetto dalle Release di GitHub), solo quando l'utente preme
    "Controlla aggiornamenti" / "Aggiorna" in Impostazioni > Generale: nessun controllo automatico all'avvio. Tutte
    le chiamate passano da `core/updater/updaterApi.ts` (la rete la fa il plugin in Rust, non la webview: niente CSP).

## Design

- I mockup approvati sono in `temi-dashboard/docs/design/temi/` e sono la fonte di verità per la grafica:
  l'app deve risultare identica. Se codice e mockup non concordano, vale il mockup.
- Ogni colore viene dai token del tema: niente esadecimali nei componenti (eccezione: colori scelti dall'utente,
  come materie e cartelle).
- Ogni nuovo widget deve funzionare in tutti e 4 i temi (Notte, Opaco, Quaderno, Fosforo), giorno e notte, e avere una taglia 1×1
  ultra minimal (vedi `temi-dashboard/docs/design/temi/widget-1x1.html`).
- Anche le pagine di dettaglio dei widget usano il linguaggio completo del tema (parti per tema, non solo colori).

## Lavori in corso

- Redesign dei temi (branch `feat/temi`): istruzioni complete in `temi-dashboard/docs/prompt-temi-claude-code.md`.
  Leggilo solo quando lavori su questo redesign.
- Gruppi (branch `online-version`): richiesta originale in `docs/prompt-gruppi.md`, stato e decisioni in
  `docs/GRUPPI.md` (vale questo se i due non concordano). Leggili solo quando lavori sui Gruppi.

## Convenzioni e insidie

- Il dettaglio di un widget si apre con il doppio click sulla cella; il doppio click su un controllo interno è ignorato, salvo i pulsanti a tutta cella marcati `data-cell-action`. I controlli fanno comunque `e.stopPropagation()`.
- Griglia della dashboard (`features/dashboard/Dashboard.tsx` + `core/layout/compactor.ts`): non scorre mai, le righe
  si dividono l'altezza disponibile. Il compactor è l'unico che decide le posizioni e non produce mai sovrapposizioni
  (scambio → sotto/sopra → posto libero più vicino, altrimenti si torna al layout di partenza). Al rilascio
  react-grid-layout ricalcola con il compactor e tiene quel risultato come stato interno: per questo `beginDrop()`
  va chiamata dal `mouseup` in capture su `window` *prima* della libreria, e `onDragStop` deve usare il layout che
  riceve, non calcolarne uno diverso (la libreria non si riallinea a props uguali alle precedenti).
- Dopo un drag i click sulla cella si ignorano per un attimo: il rilascio genera un click sul pulsante trascinato
  (es. aprirebbe un video o una nota).
- react-grid-layout (react-draggable) annulla ogni `touchstart` sulle celle e col dito non arriverebbe nessun click:
  sui tablet senza mouse `useLongPressGridDrag` lo ferma prima e glielo ripassa dopo la pressione lunga. Non toglierlo.
- `<select>` nativi: il menu aperto lo disegna il sistema, quindi `color-scheme: inherit` sul select e sfondo pieno
  sulle `option` (`--modal-bg`); `--panel-bg` non va bene, in Fosforo è trasparente e il menu esce bianco.
- Valori "ultimi" in interval/listener di lunga durata → `core/hooks/useLatestRef.ts`.
- Presenza Realtime dei Gruppi: il server chiude un canale con più di 5 `track` in 30 s. Ogni modulo passa da
  `social/presence/presenceHub.ts` (limite rispettato + via rapida in broadcast), mai `track` diretti. Un hub nuovo
  si apre con `openChannels` e `retryOnReturn` (`social/presence/openChannels.ts`: al ritorno in primo piano i canali
  caduti rientrano subito invece di aspettare l'attesa crescente).
- Contesti: `XContext.tsx` esporta solo il provider; contesto, tipo e hook in `useX.ts` (es. `useSettings.ts`).
- `tauri-plugin-notification` è pinnato `=2.4.0` (e `tauri-winrt-notification` `=0.8.1`, la versione che usa) perché la 2.5 richiede `tauri ^2.12` (il progetto usa `2.11.3`):
  non aggiornarlo senza controllare il manifesto su crates.io. Idem `tauri-plugin-localhost` (`=2.3.1`, la 2.4 vuole `^2.12`),
  `tauri-plugin-deep-link` (`=2.4.10`, anche npm) e `tauri-plugin-single-instance` (`=2.4.5`); `tauri` stesso è `=2.11.3`.
  Anche `tauri-plugin-updater` `=2.12.0` (dalla 2.13.0 vuole `^2.12`) e `tauri-plugin-process` `=2.3.1` (la 2.4.0 vuole
  `^2.12`), con le stesse versioni esatte su npm (`@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`).
- Aggiornamenti (`core/updater/`, `src-tauri/src/updater.rs`): su Windows `install` chiude il processo con
  `std::process::exit` senza `CloseRequested` né `RunEvent::Exit`. Ciò che va fermato alla chiusura (oggi il server di
  File Transfer) va fermato anche in `updater_prepare_install`, chiamato prima di `install`; il riavvio su macOS
  (`relaunch`) passa invece da `RunEvent::Exit` in `src/lib.rs`. La chiave pubblica in `plugins.updater.pubkey` non si
  cambia più: le app installate accettano solo pacchetti firmati con la privata corrispondente (Secret
  `TAURI_SIGNING_PRIVATE_KEY`); persa quella, chi ha l'app deve reinstallarla a mano. Con `createUpdaterArtifacts`
  anche `npm run tauri build` in locale vuole `TAURI_SIGNING_PRIVATE_KEY` nell'ambiente.
- `@excalidraw/excalidraw` (Lavagna) è pinnato `0.18.1`: i font si servono offline da `public/excalidraw-assets/fonts/`
  (copiati da `scripts/copy-excalidraw-assets.mjs` in `predev`/`prebuild`, `EXCALIDRAW_ASSET_PATH` in
  `widgets/whiteboard/lib/excalidrawAssets.ts`) e cartelle/nomi dei font cambiano tra versioni; se manca un file
  Excalidraw ripiega su esm.sh. Aggiornandolo, ricontrollare che nessuna richiesta esca in rete.
- Su macOS l'app installata serve il frontend da `http://localhost:14321` (`tauri-plugin-localhost`, `src/lib.rs`):
  da `tauri://localhost` YouTube rifiuta il player (errore 153, niente referrer). La porta è anche in
  `capabilities/default.json` (`remote.urls`, senza la pagina perde l'IPC): cambiarla in entrambi i posti.
  Per Tauri quella è un'origine remota, quindi anche i comandi dell'app passano dall'ACL: un comando nuovo va in
  `generate_handler!`, nel manifesto di `build.rs` e come `allow-<comando>` in `capabilities/default.json`
  (altrimenti su Mac viene rifiutato, e il portachiavi risulta "non disponibile").
- Sessione dei Gruppi (`src/secure_store.rs`): su Windows nel Credential Manager a pezzi (limite di 2560 byte per voce);
  su macOS **non nel Keychain** ma in un file per chiave in `<dati dell'app>/sessione/` (cartella 700, file 600,
  scrittura atomica con rinomina): senza Team ID ogni aggiornamento è un'altra app per il Keychain e la richiesta
  della password, se annullata, fa perdere la sessione (provato con 1.0.7 → 1.0.8). È una scelta dell'utente: meno
  protetta del Keychain (la legge qualsiasi processo dell'utente), ma senza richieste. Le voci delle versioni fino
  alla 1.0.9 (servizi `<identifier>` e `<identifier>.sessione`) non si leggono né si cancellano: farebbero comparire
  la richiesta. Non tornare al Keychain su Mac senza un Team ID di Apple.
- Le notifiche mostrano il nome dell'app solo nella versione installata; in `tauri dev` Windows le attribuisce a PowerShell.
- La pagina web servita all'iPad (`src-tauri/filetransfer/public/`) è un build copiato da un progetto esterno:
  non modificarla a mano (vedi `docs/FILE_TRANSFER.md`).
- I file sono UTF-8; PowerShell 5.1 con `Get-Content` mostra le accentate storte anche se sono corrette.
- Git: si lavora su `dev`, PR verso `main`.
