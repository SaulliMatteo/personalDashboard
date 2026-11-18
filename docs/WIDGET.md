# Dashboard e widget

Regole per un widget nuovo (4 temi, 1×1, token): `docs/TEMI.md`. Ricette (aggiungere un widget, un mini, una
notifica): `docs/ARCHITETTURA.md`, dove c'è anche la mappa di Studio, YouTube, Quaderno e Companion. Qui: la griglia
della dashboard e i widget che hanno regole proprie.

## Dashboard: convenzioni e insidie

- Il dettaglio di un widget si apre con il doppio click sulla cella; il doppio click su un controllo interno è
  ignorato, salvo i pulsanti a tutta cella marcati `data-cell-action`. I controlli fanno comunque `e.stopPropagation()`.
- Griglia della dashboard (`features/dashboard/Dashboard.tsx` + `core/layout/compactor.ts`): non scorre mai, le righe
  si dividono l'altezza disponibile. Il compactor è l'unico che decide le posizioni e non produce mai sovrapposizioni
  (scambio → sotto/sopra → posto libero più vicino, altrimenti si torna al layout di partenza). Al rilascio
  react-grid-layout ricalcola con il compactor e tiene quel risultato come stato interno: per questo `beginDrop()`
  va chiamata dal `mouseup` in capture su `window` *prima* della libreria, e `onDragStop` deve usare il layout che
  riceve, non calcolarne uno diverso (la libreria non si riallinea a props uguali alle precedenti).
- Dopo un drag i click sulla cella si ignorano per un attimo: il rilascio genera un click sul pulsante trascinato
  (es. aprirebbe un video o una nota). Un drag che non sposta nulla ed è entro `CLICK_JITTER_PX` non conta (trackpad
  del Mac): WebKit manda `dblclick` solo dopo il secondo `click`, quindi ciò che ferma il click (la protezione, un
  `<button disabled>`: si usa `aria-disabled`) su macOS si mangia anche il doppio click del dettaglio.
- react-grid-layout (react-draggable) annulla ogni `touchstart` sulle celle e col dito non arriverebbe nessun click:
  sui tablet senza mouse `features/dashboard/useLongPressGridDrag.ts` lo ferma prima e glielo ripassa dopo la
  pressione lunga. Non toglierlo.
- Dashboard del telefono (pagine 2×4, `phoneSizes`): `docs/MOBILE.md`.

## Lavagna (`widgets/whiteboard/`)

`@excalidraw/excalidraw` è pinnato `0.18.1`: i font si servono offline da `public/excalidraw-assets/fonts/`
(copiati da `scripts/copy-excalidraw-assets.mjs` in `predev`/`prebuild`, `EXCALIDRAW_ASSET_PATH` in
`widgets/whiteboard/lib/excalidrawAssets.ts`) e cartelle/nomi dei font cambiano tra versioni; se manca un file
Excalidraw ripiega su esm.sh. Aggiornandolo, ricontrollare che nessuna richiesta esca in rete.
Mockup: `docs/mockup/temi/lavagna.html`.

## Monitor di sistema (`widgets/sysmon/`)

Backend in `src-tauri/src/system_monitor/`, frontend in `src/widgets/sysmon/`. Mockup: `docs/mockup/temi/sysmon.html`. Prove: `node scripts/sysmon/metrics.test.mts` (dopo il bundle
con rolldown: scelta delle metriche, storico dei 60 s, forma che entra nella cella) e
`cd src-tauri && cargo test --lib system_monitor` (unità e "non disponibile → None").

- Legge solo l'hardware di questo computer, **senza driver né amministratore** (niente WinRing0/LibreHardwareMonitor:
  Defender li segnala) e **niente temperatura CPU su Windows** (servirebbe un driver: `cpuTempReason: "windows"`).
- Windows: sysinfo + PDH (`GPU Engine`, aggregato come Gestione attività: massimo tra i tipi di engine della somma) +
  D3DKMT (nome, VRAM, temperatura/ventola/consumo della GPU) + IOCTL sul disco aperto con accesso 0 (temperatura SSD).
  macOS: sysinfo `component` e `gpu` (codice non compilabile da Windows: lo prova solo la CI o un Mac).
- Ogni campo è `Option`: un dato che manca è `null` e la UI mostra "—", mai 0.
- Un solo thread (`sysmon`) che gira solo con iscritti (`sysmon_subscribe/unsubscribe`, contatori widget/dettaglio;
  processi completi e CPU per thread solo col dettaglio) e manda l'evento `sysmon:snapshot`; si ferma in `shutdown`
  (chiusura, `RunEvent::Exit`, `updater_prepare_install`). Il provider si iscrive solo con un `useSysmonFeed` montato e
  la finestra visibile; lo storico dei grafici (60 s) sta solo in memoria.
- Scelta delle metriche (`sysmonMetrics`) e intervallo (`sysmonInterval`) sono in `PER_DEVICE_SETTINGS`. Su Android e
  nel browser (`SYSMON_AVAILABLE` falso) il widget mostra solo il messaggio e non chiama nessun comando.
- Le celle cambiano con la finestra: la forma del widget la sceglie `lib/fit.ts` dallo spazio misurato (forma del
  mockup, poi righe "etichetta valore", poi senza intestazione, poi meno metriche), mai testi schiacciati.
- Su Windows l'elenco delle reti di sysinfo contiene anche i filtri NDIS ("Ethernet-QoS Packet Scheduler-0000"…): si
  scartano (`units::is_filter_instance`), altrimenti il traffico si conta più volte.

## Tempo allo schermo (`widgets/screentime/`)

Backend in `src-tauri/src/screen_time/` (registratore del computer; `android.rs` + plugin `plugins/usage-stats` per il
telefono) e `src-tauri/src/app_tray.rs` (icona vicino all'orologio, avvio col computer), frontend in
`src/widgets/screentime/`. Mockup: `docs/mockup/widget/tempo-allo-schermo.html` (widget in dashboard, proposta A),
`docs/mockup/temi/tempo-pc.html` (pagina) e `tempo-pc-telefono.html` (telefono, filtro e dispositivi). Prove (dopo il bundle con rolldown):
`scripts/screentime/classify.test.mts` (classificazione dei segmenti), `migrations.test.mts` (migrazioni
su SQLite vero) e `logic.test.mts` (ore e mezzanotte,
focus e serie, limiti, pause e sessioni, settimana, etichette delle date, dispositivi), `androidEvents.test.mts`
(eventi di Android → tratti, pacchetti → app, giorni persi); `scripts/sync/round.test.mts`
(righe di due dispositivi col sync); `cd src-tauri && cargo test --lib screen_time` (segmenti).

- **Privacy**: il titolo della finestra esce dal Rust solo verso il frontend, serve a `classifyApp` (es. una chiamata
  nel browser) e poi si butta. Nel DB vanno solo app, categoria e secondi. Non loggare titoli e non salvarli in `meta`.
- **Niente siti** (scelta dell'utente): ogni browser (`BROWSER_KEYS` di `lib/classify.ts`) conta come app, sempre
  categoria "Browser"; un video nel browser senza toccare nulla non conta. Le migrazioni 29 (Opera) e 30 (tutti) hanno
  unito le righe vecchie con un sito e tolto i limiti per sito; dalla 31 la tabella non ha più la colonna. Le vecchie scelte di categoria per un sito (`web:…` in `companionAppCategories`) restano ma non contano più.
  La pagina: App a sinistra, Limiti sopra Pause a destra (`.stp-stack`).
- **Perché in Rust**: con la finestra nascosta la WebView rallenta i timer JS (fino a uno al minuto). Il thread
  `screentime` campiona ogni 2 s (stesse letture di Pixy, `companion.rs`) e tiene i segmenti; il provider li ritira
  ogni 30 s (`screentime_take`), su `visibilitychange` e prima di uscire (`core/system/beforeQuit.ts`).
- **Avvio e stop del registratore stanno nello stesso effetto e passano dalla stessa coda** (`queueRef` in
  `ScreenTimeContext.tsx`): con StrictMode, se solo lo stop passava dalla coda, al Rust arrivavano avvio, avvio, stop e
  il registratore restava spento.
- Catena di un segmento: `lib/classify.ts` (app con `classifyApp` + correzioni manuali `companionAppCategories`,
  condivise con Pixy; i browser sempre "Browser"; la
  dashboard stessa è `__self`; schermata di blocco = via dal PC) → `lib/aggregate.ts` (spezza su ore e mezzanotte; l'inattività conta
  solo in video/musica/chiamate) → `screen_usage` (`seconds += ?` sulla riga di qui, `device_kind` di `THIS_DEVICE`).
- Tabelle: `screen_usage` (migrazione 31, giorno × ora × app × dispositivo) **sincronizzata** (`lazy`, vedi
  `docs/SYNC.md`): ci sono anche le righe degli altri dispositivi (`origin_device` non NULL, `device_kind`
  computer/telefono). Nel cloud solo app, categoria e secondi, nella tabella privata del sync. Sessioni
  (`screentime_sessions`, tempo continuo, una pausa ≥ 5 min la chiude) e limiti (`screentime_limits`, migrazione 27)
  restano di questo dispositivo. Si tengono 400 giorni, pulizia una volta al giorno (`screentime_pruned_day` in
  `meta`), anche delle righe arrivate. Il tipo `screen_usage` va prima aggiunto su Supabase
  (`…_sync_tempo_schermo.sql`, `docs/GRUPPI.md` § 9.7).
- Dispositivi (`lib/devices.ts`): filtro "Tutti / Computer / Telefono" (`screentimeDeviceFilter`, per dispositivo,
  si vede e vale solo col sync acceso) per widget e pagina; con "Tutti" e tempo su tutti e due, segno del dispositivo
  accanto alle app e "PC … · tel. …" nelle righe. La stessa `app_key` su PC e telefono è una riga sola. Limiti, menu
  dell'icona e pause contano solo le righe di qui (`local`). "telefono aggiornato alle…" = l'ultimo secondo arrivato.
- Limiti: avviso all'80 % (facoltativo) e al 100 %, una volta al giorno per limite (`screentime_limit_notices` in
  `meta`). Pausa: promemoria ogni `screentimeBreakMinutes` di tempo continuo. Notifiche firmate da Pixy.
- **Blocco al limite** (solo Windows, `SCREENBLOCK_AVAILABLE`; mockup `docs/mockup/widget/tempo-blocco.html`): un
  limite con `block` (migrazione 32, interruttore nel dialog) a tempo finito fa coprire l'app da una schermata. A ogni
  salvataggio (~30 s) e quando cambiano i limiti `pushBlock` (`ScreenTimeContext.tsx`) manda al Rust le app da coprire
  (`blockTargets` in `lib/limits.ts`; per una categoria `limitApps` in `lib/summary.ts`: app viste ieri e oggi, scelte
  a mano e, per Browser, i browser noti); il Rust (`src-tauri/src/screen_block.rs`) guarda l'app davanti ogni secondo e
  mette sopra la finestra `blocco` (`?view=blocco` in `main.tsx` → `block/BlockScreen.tsx`, senza DB: tema e testi
  dal Rust). "Chiudi" = `WM_CLOSE` come la X; "Altri 15 minuti" una volta al giorno per limite
  (`screentime_block_extensions` in `meta`, salvata dall'evento `screenblock:extended`; lo controlla anche il Rust);
  "Apri la dashboard" = evento `app:open-widget` → `NavContext`. Un'app di una categoria mai vista oggi viene presa al
  salvataggio dopo (≤ ~1 min). Nel widget l'avviso più urgente diventa "bloccata fino a mezzanotte" o "N min in più,
  poi si blocca" (Piccola: "bloccato"); nella pagina il lucchetto accanto ai limiti che bloccano.
- Focus/svago: classe per categoria (`lib/focus.ts`, `screentimeFocusClasses`; vuota = default), editor nella pagina
  (Settimana). Conteggio, soglie e filtro sono in `PER_DEVICE_SETTINGS`; classi, obiettivo di focus e
  `companionAppCategories` si sincronizzano (la vista somma i dispositivi, la categoria deve essere la stessa).
- **Widget** (`ScreenTimeWidget.tsx`, proposta A del mockup): ogni taglia dice una cosa sola e c'è un solo numero
  grande, il totale di oggi. Piccola: anello delle classi con dentro "oggi", il tempo grande ("5:12", `clockTime`) e sotto "ore" o
  "minuti" (con un limite vicino "al limite"/"bloccato" al posto di "oggi"); Larga: totale, una riga (ieri,
  o PC/telefono con "Tutti") e 3 app come barre (`AppBars`, il tempo solo sulla prima); Alta: anche la giornata a
  parole (`DayInWords`, al posto della legenda); Media: anello del focus e la giornata in 6 momenti di 4 ore
  (`DayMoments`). Le celle cambiano altezza con le righe della griglia (4-8), quindi la Piccola e la Larga si
  adattano con `@container`: nella Piccola l'anello prende tutta l'altezza e il testo dentro scala con lui (l'anello
  è un container, unità `cqw`; sotto i 112 px di anello sparisce "oggi"); la Larga non ha titolo, il totale sta al
  centro della metà sinistra (il segno del filtro va davanti alla riga sotto) e con la cella bassa le app sono 2
  (mai una riga tagliata). Limiti, pausa e permesso del telefono sono **un solo avviso**, il più urgente (`pickAlert` in
  `lib/widgetText.ts`: app bloccata → proroga in corso → limite all'80 % → pausa oltre `screentimeBreakMinutes` →
  permesso), e con l'avviso le app
  scendono di una. L'anello ha una forma per tema (`card/rings.tsx`, `SCREENTIME_RINGS`; Ombra con `perMode`:
  eclisse di notte, stella di giorno), il resto cambia forma col CSS. Il dettaglio sta tutto nella pagina.
- Pagina (`ScreenTimeDetail.tsx` + `detail/`): `usePeriodData` legge il giorno o la settimana dal DB e per oggi usa le
  righe del provider; si rilegge a ogni `revision` (una categoria cambiata a mano si vede anche nei giorni passati;
  dopo un giro del sync con `screen_usage` il provider rilegge, `onSyncApplied`). Il
  giorno di oggi viene da `now` del contesto, non da `Date.now()` nel render (lint `purity`).
- Dove si conta (`canRecord`): Windows e macOS col registratore (`SCREENTIME_AVAILABLE`, con limiti, pause e menu
  dell'icona: `hasLimits`) e il telefono (`SCREENTIME_PHONE`). Su Linux widget e pagina mostrano solo le righe arrivate
  col sync (`SCREENTIME_VIEWABLE`), senza chiamare comandi; rileggono ogni minuto e al ritorno sull'app. Nel browser
  solo il messaggio.
- **Telefono** (`data/phoneUsage.ts`, `lib/androidEvents.ts`, `lib/androidApps.ts`): non c'è un registratore, l'app
  non gira in sottofondo. Con il permesso "Accesso ai dati di utilizzo" (`PACKAGE_USAGE_STATS`, lo accende l'utente
  nella pagina di Android; `needsAccess`/`grantAccess` nel contesto, ricontrollato a ogni ritorno sull'app) il
  provider legge la cronologia di Android (`UsageStatsManager.queryEvents`) all'avvio, al ritorno e ogni 30 s ad app
  aperta, da `screentime_android_cursor` in `meta` fino ad adesso. Un'app conta da quando va in primo piano a quando
  non lo è più, si spegne o blocca lo schermo, o arriva un'altra app; la Home non conta (`__home`), la dashboard è
  `__self`. **Il tratto ancora aperto (di solito la dashboard stessa) non si conta: il cursore resta al suo inizio**,
  così rileggere non conta due volte. Il cursore si salva dopo le righe. Alla prima lettura si chiedono 30 giorni
  (Android ne ha circa una settimana); se Android non ha più i giorni dal cursore in poi, il buco va in
  `screentime_android_gaps` e la Settimana lo dice (avviso e tratteggio sulle colonne, solo sul telefono).
  Pacchetti → righe: `KNOWN_PACKAGES` dà la chiave del PC (`com.discord` → `discord`) così su "Tutti" è una riga
  sola; gli altri tengono il pacchetto come chiave e il nome di Android, categoria da `ApplicationInfo.category`, poi
  dalle regole del PC sul nome. Niente limiti né promemoria (al loro posto Dispositivi e Sessioni = le volte che lo
  prendi in mano). `screentimeEnabled` vale anche qui (voce `screenUsage` delle impostazioni, testi `android`): il
  permesso fa da cancello, quindi senza permesso non si conta comunque.
- La X che nasconde la finestra (`closeToTray`, default sì) e "Avvia con il computer" stanno in Impostazioni ›
  Generale › Finestra e avvio (`features/settings/tabs/WindowSection.tsx`); il collegamento col Rust è
  `core/system/useAppWindowBridge.ts`.

## File Transfer (`widgets/filetransfer/`)

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

### Dove sta cosa

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

### Dati

I file ricevuti stanno nella cartella dati dell'app, sotto `file-transfer/received`
(il pulsante "Apri cartella" nella pagina la apre in Esplora file o nel Finder).

### Aggiornare la pagina web dell'iPad

La pagina servita all'iPad (`src-tauri/filetransfer/public/`) è un build copiato da un progetto esterno: **non
modificarla a mano**.

Dopo aver modificato `FileTransfer/web/src`, compila con `sync-web.bat` del progetto originale e
copia il contenuto di `FileTransfer/server/public/` in `src-tauri/filetransfer/public/`.

### Telefono Android: invia invece di ricevere

Su Android il server non c'è e il widget **invia** al PC (`src-tauri/src/file_send.rs`, `ft_check_target`/`ft_send_file`;
frontend `FileSendContext.tsx`/`FileSendDetail.tsx`, ruolo scelto in `data/fileSendApi.ts`): stessa richiesta della
pagina dell'iPad, senza `Origin`. Indirizzo scritto a mano e ricordato.

### Sicurezza

Il server è esposto sulla rete locale senza autenticazione: le difese (in `http.c` e in `file_send.rs`) sono elencate
in `docs/SICUREZZA.md` e **non vanno tolte**.

### Limiti

- Il server C funziona su Windows (Winsock), macOS e Linux (socket POSIX + pthread). Sugli altri sistemi
  l'app si compila e il widget mostra un errore se si prova ad avviarlo.
- La porta è 5000; se è occupata il server prova fino alla 5009 e mostra quella reale. Su macOS la 5000
  è quasi sempre di AirPlay Receiver (Impostazioni › Generali › AirDrop e Handoff).
- Su macOS stop e disconnessioni: `shutdown()` prima di `close()` per sbloccare `accept()`, e
  `SO_NOSIGPIPE` perché un iPad che chiude a metà non uccida l'app.
- Se Windows chiede il permesso del firewall al primo avvio del server, va concesso alle reti private
  (su macOS: "Consenti" alle connessioni in entrata; con la firma ad-hoc può richiederlo a ogni aggiornamento):
  senza, l'iPad non riesce a collegarsi.
