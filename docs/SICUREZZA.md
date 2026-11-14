# Sicurezza

Da leggere prima di toccare: rete, CSP, comandi Tauri e capability, il server di File Transfer, la sessione dei
Gruppi, l'HTML delle Note, il server Supabase, i permessi di Android. Ultimo controllo completo: 2026-11-14 (in fondo).

## Modello

L'app è locale: il rischio principale è che del contenuto non fidato (una nota incollata o ricevuta da un amico, un
payload della chat, un file importato) riesca a eseguire codice nella pagina, perché la pagina può chiamare i comandi
dell'app (DB, file del Quaderno, sessione). Le difese sono a strati: HTML ripulito → CSP → finestra che non naviga
fuori dall'app → comandi che controllano i propri argomenti → capability strette. Il secondo fronte è il server di
File Transfer, l'unica porta aperta sulla rete locale. Il terzo è il server dei Gruppi, dove ogni utente deve vedere
solo ciò che gli spetta.

## Rete: cosa può uscire

Nessuna risorsa caricata da internet a runtime (font compresi: pacchetti `@fontsource` locali). Eccezioni, tutte
opzionali:
- i dati del widget Meteo (Open-Meteo), solo se l'utente imposta la città e lo usa; unica `fetch`:
  `widgets/weather/data/weatherApi.ts` (cache in `meta`, `weather_cache`);
- YouTube: player incorporato e metadati oEmbed (`widgets/youtube/lib/youtube.ts`), solo usando il widget;
- i Gruppi (Supabase, regione UE), solo se la build ha `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` e l'utente
  accede con Google. Senza, l'app resta solo locale ("Gruppi non configurati"); con il server irraggiungibile
  funziona tutto il resto. Tutta questa rete passa da `core/cloud/`, l'unico che importa `@supabase/supabase-js`;
- gli aggiornamenti dell'app (`latest.json` e pacchetto dalle Release di GitHub): `latest.json` al massimo una volta
  al giorno se è acceso `autoCheckUpdates` (`core/updater/autoCheck.ts`), oppure con "Controlla aggiornamenti"; il
  pacchetto solo con "Aggiorna". Tutto da `core/updater/updaterApi.ts` (la rete la fa il plugin in Rust: niente CSP).
  Il pacchetto è accettato solo se firmato con la chiave di `plugins.updater.pubkey`;
- File Transfer: solo rete locale (server sul PC, invio dal telefono a un IPv4 privato).

**CSP** in `src-tauri/tauri.conf.json` (`csp` e `devCsp`): un dominio nuovo va aggiunto in entrambe, e in questo
elenco. Niente `unsafe-inline` negli script in produzione, `object-src 'none'`, `form-action 'none'`. Per Supabase c'è
il jolly `*.supabase.co` perché il riferimento del progetto sta solo in `.env.local`.

**Segreti mai nel repo**: `.env.local`, chiavi di firma (`*.jks`, `keystore.properties`), `TAURI_SIGNING_PRIVATE_KEY`
e gli altri Secrets della CI (elenco in `docs/BACKEND.md` e `docs/GRUPPI.md` § 9). Nell'app c'è solo la chiave
*publishable* di Supabase, che è pubblica per natura: la protezione dei dati è la RLS. Codici di accesso, token e
titoli delle finestre non vanno mai nei log né nei messaggi di errore.

## Finestra e comandi

- La finestra principale naviga solo dentro l'app (`on_navigation` + `is_app_url` in `src-tauri/src/lib.rs`): un
  link esterno si apre nel browser di sistema, mai nella webview che ha accesso ai comandi. Su macOS passano anche gli
  host del player di YouTube (`is_embed_url`), che non hanno accesso ai comandi. Lato pagina i click sui link passano
  da `core/system/externalLinks.ts`; ovunque si apre solo `http(s):` e `mailto:`.
- **Un comando nuovo** va in `generate_handler!` (`src/lib.rs`), nel manifesto di `build.rs` e come `allow-<comando>`
  in `capabilities/default.json` (desktop) e, se serve su Android, `mobile.json`: su macOS la pagina è un'origine
  remota (`http://localhost:14321`) e senza ACL il comando viene rifiutato. Il frontend lo chiama da un solo file
  `data/*Api.ts`, che non lo invoca dove non è supportato.
- **Ogni comando controlla i suoi argomenti come se la pagina fosse ostile**: i percorsi dell'app li decide il Rust,
  dalla pagina arrivano solo nomi o file scelti nel selettore. Esempi da imitare: `ft_read_preview` accetta solo un
  nome di file (`is_plain_file_name`: niente separatori, `..` o `:`, che su Windows farebbe uscire dalla cartella);
  `file_open`/`file_share` solo file dentro il vault, dopo `canonicalize`; `ft_send_file` solo URI `content://` del
  selettore e IPv4 privati (non deve poter mandare file dell'app né uscire su internet scavalcando la CSP);
  `secure_store_*` solo chiavi `[a-z0-9-]{1,64}`.
- **Capability del plugin fs** (desktop): scrittura, rinomina e cancellazione solo in `$DOCUMENT/Notes`. La lettura
  è larga (`$HOME/**` e le cartelle dell'utente) perché una nota accetta file trascinati da qualsiasi cartella; sono
  però negate (`deny`) le cartelle dei dati dell'app (`$APPDATA`, `$APPCONFIG`, `$APPLOCALDATA`: database e, su macOS,
  la sessione) e `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.android-keys`. Non allargare lo scope e non togliere i `deny`.
  Su Android la lettura è solo nel vault.
- `sql:allow-execute` dà alla pagina tutto SQLite (anche `VACUUM INTO`/`ATTACH` su un percorso): è il motivo per cui
  l'HTML non fidato non deve mai arrivare a eseguire script.

## HTML delle Note e contenuti degli altri

- Il contenuto delle pagine è HTML di un `contentEditable`. **Ogni** punto che lo mette nel DOM (`innerHTML`,
  `insertHTML`, `dangerouslySetInnerHTML`) passa prima da `sanitizeHtml` (`widgets/notes/lib/html.ts`): lista chiusa
  di tag e attributi, `href` solo `http(s)`/`mailto`, `style` ridotto a colore e dimensione, niente `img`/`svg`/
  `iframe`/`form`; con `source: "esterno"` (incolla da un'altra app, note ricevute) niente blocchi che rimandano a
  file. Un attributo nuovo va aggiunto lì con il suo validatore, mai lasciato passare così com'è.
- Il codice evidenziato non passa da `innerHTML` (`lib/codeHighlight.ts`); i testi costruiti a mano usano `escapeHtml`
  (`lib/viewExport.ts`).
- Ciò che arriva da un'altra persona (chat dei Gruppi e degli amici, schede dei widget, presenza) il server non lo
  guarda: si valida campo per campo a ogni lettura (`parse` delle `chatActions`, `PresenceCodec`), un payload non
  valido diventa la scheda di ripiego, e il testo degli altri si mostra sempre come testo, mai come HTML.
- Deep link: `personaldashboard://auth/callback` vale solo con un login in corso (PKCE: il verificatore sta
  nell'archivio sicuro, un codice rubato o riusato non serve); `personaldashboard://amici/<codice>` apre soltanto la
  finestra "Aggiungi un amico" col codice scritto, la richiesta la manda l'utente.

## File Transfer: difese da non togliere

Il server HTTP in C (`src-tauri/filetransfer/c/`) è esposto sulla rete locale senza autenticazione (la pagina
dell'iPad non si può cambiare), quindi le difese stanno tutte nel C (`http.c`):
- niente header CORS e `Origin` uguale a `http://<Host>`: un sito aperto nel browser non può caricare file;
- `Host` solo IPv4 o `localhost` (DNS rebinding);
- `X-File-Name` obbligatorio (niente richieste "semplici" senza preflight);
- nomi di file sicuri: niente separatori, `..`, caratteri di controllo, nomi riservati di Windows (`CON`, `NUL`,
  `COM1`…), e UTF-8 valido; un nome non valido diventa `upload.bin`;
- anche i percorsi dei file statici (GET) rifiutano `..`, `\`, `:` e i nomi riservati di Windows;
- mai sovrascrivere (`"wbx"`, poi "nome (1).ext"), file a metà cancellati;
- al massimo 64 GB per file, 32 connessioni, 30 s di silenzio.

I percorsi sono UTF-8: su Windows si aprono solo con `file_open`/`make_dir`/`file_remove` di `platform.h` (funzioni a
caratteri larghi), mai con `fopen` diretto, altrimenti cartelle utente e nomi con lettere accentate non funzionano.
Prova a mano: compilare i `.c` con un `main` che chiama `http_server_start_with_dirs` e usare `curl` (upload con nome
accentato, `/con`, `Origin` estraneo, `Host` con un dominio, senza `X-File-Name`).

Rischio accettato: chiunque sulla stessa rete, col server acceso, può mandare file (finiscono in una cartella dei dati
dell'app e non vengono mai eseguiti né aperti da soli) e riempire il disco. Il server si accende a mano.

## Sessione dei Gruppi

Mai in SQLite o `localStorage`: `secure_store_*` (`src-tauri/src/secure_store.rs`). Windows: Credential Manager.
Android: file cifrati AES-256-GCM con chiave nell'Android Keystore, in `noBackupFilesDir`. macOS: file `600` in una
cartella `700` dei dati dell'app, **non** il Keychain (scelta dell'utente, motivi in `docs/BACKEND.md`): meno
protetta, la legge qualsiasi processo dell'utente. Linux: nessun archivio, quindi niente Gruppi.

## Server (Supabase)

Regole per ogni migrazione (dettagli e ricetta in `docs/GRUPPI.md` § 3-4 e `docs/ARCHITETTURA.md`):
- RLS attiva su ogni tabella (lo controlla il test `01_accesso.sql`), `revoke` dei default, poi solo i `grant` che
  servono; le scritture passano da RPC `SECURITY DEFINER` con `SET search_path = ''`, nomi completi e controllo di
  `auth.uid()`; funzioni interne nello schema `private`, senza `execute` per i client;
- i dati del sync (`sync_records`, bucket `sync-files`) sono leggibili **solo** dal proprio utente, mai dai compagni
  di gruppo; i messaggi diretti solo da mittente e destinatario, per 90 giorni;
- limiti sui tentativi (codici invito e amico, richieste, messaggi) e sulle dimensioni (500 righe per `sync_push`,
  2 MB per elemento, 50 MB per file);
- mai modificare una migrazione applicata: si aggiunge un file nuovo, con il suo test pgTAP.

Rischi accettati: il tempo di studio è dichiarato dal client (solo limiti di plausibilità); `from` nei messaggi dal
vivo non è garantito da Realtime (chi riceve confronta con la presenza); non c'è una quota totale per utente sulle
righe e sui file del sync (l'app è per un gruppo di amici, il limite è quello del piano).

## Android

Permessi nel manifest con il loro perché (`INTERNET`, allarmi esatti, notifiche); `usesCleartextTraffic` è `false`
nelle release; backup automatico solo di `dashboard.db`; il FileProvider espone solo la cartella del Quaderno e
concede la sola lettura del singolo file. Dettagli in `docs/ANDROID.md`.

## Dati dell'utente

- Importare un database sostituisce quello del dispositivo: `db_import_apply` tiene il precedente accanto come
  `dashboard.db.prima` (uno solo). Il file importato è controllato solo nell'intestazione e nella versione.
- Tempo al PC: il titolo della finestra non va mai su disco né nei log (`docs/WIDGET.md`).

## Dipendenze (stato al 2026-11-14)

- `cargo audit` segnala avvisi in crate transitive di `tauri` e dei plugin pinnati (`zip` da `tauri-plugin-updater`,
  `libsqlite3-sys` e `rsa` da `sqlx` di `tauri-plugin-sql`, `rkyv`, più alcune crate non più mantenute). Non si
  aggiornano da sole: servono le versioni dei plugin per `tauri ^2.12` (vedi "Versioni pinnate" in `docs/BACKEND.md`).
  Nell'app: lo zip estratto dall'updater è solo un pacchetto già verificato con la nostra firma; SQLite apre solo il
  nostro database e i file scelti dall'utente; `rsa` è nel ramo MySQL di `sqlx`, non usato. Da rivedere quando si
  passa a `tauri 2.12`.
- `npm audit` segnala `nanoid` dentro `@excalidraw/excalidraw` (pinnato `0.18.1`): riguarda dimensioni non intere o
  negative passate al generatore, che qui sono costanti della libreria. Si chiude aggiornando Excalidraw.
- La CI usa azioni di terzi indicate per tag (`tauri-apps/tauri-action@v0`, `dtolnay/rust-toolchain`,
  `swatinem/rust-cache`) nello stesso job che ha i Secrets di firma: fissarle a un commit sarebbe più sicuro, ma poi
  vanno aggiornate a mano. Non fatto: è una scelta dell'utente.

## Checklist per un cambiamento

1. Dominio nuovo → CSP (`csp` e `devCsp`) + "Rete" qui sopra + informativa nel README se riguarda la privacy.
2. Comando nuovo → handler, `build.rs`, capability; argomenti controllati nel Rust; un solo `*Api.ts`.
3. HTML o testo che viene da fuori → `sanitizeHtml`/validatore, mai `innerHTML` diretto.
4. Tabella o RPC nuova sul server → RLS, `revoke`, definer con `search_path` vuoto, test pgTAP.
5. File Transfer → le difese dell'elenco restano tutte; prova con `curl`.
6. Alla fine: `npm run build`, `npm run lint`, `cargo check`, `cargo test --lib`, `npm audit`, `cargo audit`.

## Controllo del 2026-11-14

Letti per intero: backend Rust (comandi, plugin), server C, capability e CSP, plugin Kotlin e manifest di Android,
migrazioni del sync e degli amici, tutti i punti che scrivono HTML nelle Note, apertura dei link, login e deep link,
workflow della CI. Delle altre migrazioni sono stati controllati RLS, `search_path` e `grant` (più i test pgTAP
esistenti, non rilanciati: Docker non disponibile). Corretto:
- `ft_read_preview`: un nome con `:` poteva uscire dalla cartella dei ricevuti su Windows;
- server C: i nomi riservati di Windows nei file statici potevano bloccare un thread (Windows 10);
- server C: percorsi e nomi non ASCII su Windows (cartella utente con accenti: server inutilizzabile; nomi dei file
  salvati storti); nomi non UTF-8 ora rifiutati;
- capability: cartelle dei dati dell'app e delle chiavi negate alla lettura del plugin fs;
- importazione del database: il DB precedente non viene più perso.
