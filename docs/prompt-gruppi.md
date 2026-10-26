# Prompt per Claude Code — Funzione "Gruppi" (studio condiviso in tempo reale)

Lavori sul repository `SaulliMatteo/personalDashboard`. Prima di tutto leggi `CLAUDE.md` e `docs/ARCHITETTURA.md`
e rispettane tutte le regole (dipendenze, repository SQL, migrazioni, temi, design, lingua italiana).
**Se non sei sicuro di qualcosa, fermati e chiedi: non indovinare.**

Lavora su un branch nuovo creato da `dev` (es. `feat/gruppi`), PR verso `main` come da convenzione.
Il lavoro è diviso in **fasi**: alla fine di ogni fase fermati, riassumi cosa hai fatto, cosa hai verificato e come,
e aspetta la mia conferma prima di passare alla successiva.

---

## 1. Obiettivo

Aggiungere all'app (oggi solo locale) una funzione **opzionale** di gruppi tra amici:

- login con Google;
- creare un gruppo, entrarci con un codice invito, abbandonarlo;
- vedere i membri del gruppo con il loro **stato di studio in tempo reale** (sta studiando / in pausa / offline,
  con il timer che scorre) e il **tempo di studio di oggi e della settimana**.

È il primo modulo di una struttura "social" che in futuro dovrà ospitare altre funzioni (es. i Pixy di tutti che
studiano insieme in un luogo comune, una sala cinema condivisa). **Non implementare queste funzioni future**, ma
costruisci la struttura in modo che si possano aggiungere senza toccare il nucleo (vedi §4).

### Fuori ambito per questa versione
Chat/messaggi (nel widget L c'è solo il segnaposto), sala cinema, avatar, app mobile. Non aggiungerli.

> **Cambiato in Fase 5** (deciso con l'autore): nella Stanza comune ci sono i **Pixy veri** del Companion, con le
> espressioni sincronizzate solo se l'utente lo attiva. Dettagli in `docs/GRUPPI.md`, che prevale su questo file.

---

## 2. Decisioni già prese (non rimetterle in discussione senza chiedere)

| Tema | Decisione |
|---|---|
| Modello | **Local-first resta**: il SQLite locale è la fonte di verità. Senza account o offline l'app funziona esattamente come oggi; le funzioni di gruppo sono semplicemente non disponibili. Online e con account: accesso, sincronizzazione, funzioni di gruppo. |
| Backend | **Supabase** (Postgres + Auth + Realtime), piano gratuito, **regione UE** (es. Francoforte). Nessun server nostro. |
| Login | **Google**, tramite browser di sistema (mai dentro la webview) con PKCE e ritorno nell'app via deep link. |
| Nome visibile | **Nome utente scelto nell'app** al primo accesso, unico. Nome reale ed email di Google **non vengono mai mostrati** agli altri né salvati in tabelle leggibili da altri. |
| Cosa si condivide | Solo **totali giornalieri** (secondi per giorno) e **stato live del timer**. Le sessioni singole non escono dal dispositivo. |
| Materie | Il nome della materia in corso è visibile agli altri **solo se l'utente attiva un'impostazione**, **spenta di default**. |
| Storico iniziale | Al primo accesso si caricano **solo le ultime 2 settimane** (14 giorni, oggi compreso). |
| Giorno/settimana | Giorno **locale di ciascun utente**; settimana **da lunedì a domenica**. |
| Ruoli | `owner` e `member`. Solo l'owner rimuove membri e rigenera il codice. Se l'owner abbandona, il gruppo passa al **membro più anziano** (per data di ingresso); se il gruppo resta vuoto viene **eliminato**. |
| Limite membri | **30** per gruppo (valore salvato nel gruppo, controllato dal server). |
| Mobile | Non ora, ma tutto deve permettere di aggiungerlo in qualsiasi momento (vedi §4). |
| Anti-cheat | Il tempo è dichiarato dal client: si accetta che sia falsificabile (uso tra amici). Il server impone solo limiti di plausibilità. Documentalo. |
| Dove vive la UI | **Tre punti**: (1) nuova voce **"Stanza comune"** nella barra laterale, con un badge col numero di chi studia ora; (2) un **widget "Gruppi"** in dashboard (1×1 = quanti studiano ora; M = classifica oggi/settimana; L = classifica + spazio "Messaggi", segnaposto fuori dalla v1); (3) la **pagina di dettaglio del widget = Impostazioni della stanza**, raggiungibile anche da un pulsante dentro la Stanza comune (stessa pagina). |
| Sale | La Stanza comune è una sala studio disegnata: **sale da 8 posti**. Ci si siede **automaticamente nella prima sala con posti liberi**; ci si può **spostare** in un'altra sala se ha posti; a ogni apertura dell'app si torna alla **prima sala libera** (la scelta non si ricorda). Le sale esistono solo se servono. Chi è offline **non siede**: compare nella striscia "Fuori dalla stanza". |
| Impostazione materia | "Mostra la materia che sto studiando" vale **per tutti i gruppi** (un'unica impostazione in `core/settings/schema.ts`), mostrata anche nelle Impostazioni della stanza. |

---

## 3. Segreti e GitHub — REGOLE TASSATIVE

Il repository è **pubblico**. Nulla di sensibile deve finire nel repo, nella cronologia git, nei log o nei messaggi di commit.

**Non devono MAI comparire nel repo né nell'app:**
- la chiave `service_role` / *secret key* di Supabase;
- la password del database e le stringhe di connessione Postgres;
- il **client secret** di Google OAuth (va solo nel pannello di Supabase, Auth › Providers › Google);
- token di accesso personali (Supabase CLI, GitHub, Google), token di sessione utente, refresh token;
- dati reali di utenti (email, nomi) anche in test, fixture o screenshot.

**Possono stare nell'app** (sono pubblici per progetto, protetti dalle RLS): URL del progetto Supabase e chiave
*publishable* (o `anon` legacy). Anche queste però **non vanno committate**: si leggono da variabili d'ambiente Vite
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) da un file `.env.local`, così si può cambiare progetto senza
toccare il codice. Il Client ID di Google non serve nell'app (lo gestisce Supabase).

**Cosa devi fare:**
1. Aggiorna `.gitignore` *prima* di creare qualsiasi file sensibile: `.env`, `.env.*` (eccetto `.env.example`),
   `supabase/.temp/`, `supabase/.branches/`, eventuali file di credenziali o dump.
2. Crea `.env.example` con soli **segnaposto** e commenti che spiegano dove trovare i valori.
3. Il workflow di release (`.github/workflows/release.yml`) deve leggere i valori da **GitHub Actions Secrets**,
   mai da file nel repo. Indica a me quali secret creare.
4. Se `VITE_SUPABASE_URL`/chiave mancano, l'app deve compilare e funzionare in modalità solo locale, mostrando
   "Gruppi non configurati" invece di rompersi.
5. **Prima di ogni commit**: rivedi `git diff --cached` e cerca stringhe sospette (`service_role`, `sb_secret_`,
   `eyJ` (JWT), `postgres://`, `GOCSPX-` (secret Google), `password`, email). Se è disponibile `gitleaks`, eseguilo
   sul repo. Se trovi un segreto già committato **fermati e avvisami** (va ruotato, non basta cancellarlo).
6. Non stampare mai token o chiavi in `console.log`, nei log Rust (`tauri-plugin-log`) o nei messaggi di errore
   mostrati in UI.
7. I passaggi che richiedono i miei account (creare il progetto Supabase, il client OAuth Google, inserire il secret,
   impostare le variabili) **li faccio io**: tu scrivi istruzioni precise in `docs/GRUPPI.md` e non chiedermi di
   incollarti chiavi segrete in chat.

---

## 4. Architettura

### 4.1 Nucleo + moduli (per la flessibilità futura)

Costruisci un **nucleo stabile** che non dovrà cambiare quando arriveranno nuove funzioni, e lo studio come
**primo modulo**, non come caso speciale.

**Vietato**: una tabella generica con JSON per "qualsiasi dato futuro". Ogni modulo ha tabelle proprie e tipizzate,
con vincoli e RLS.

**Nucleo (backend):**
- `profiles` — `id` (= `auth.users.id`), `username` (unico, case-insensitive, 3–20 caratteri, solo `[a-z0-9_.]`
  o set analogo da proporre), `created_at`. Nessuna email, nessun nome reale.
- `devices` — `id` uuid, `user_id`, `platform` (`windows` | `macos` | `linux` | `android` | `ios`), `created_at`,
  `last_seen_at`. È ciò che rende il mobile aggiungibile senza modifiche.
- `groups` — `id`, `name` (≤ 40), `description` (≤ 200), `owner_id`, `invite_code`, `max_members` (default 30),
  `created_at`.
- `group_members` — `group_id`, `user_id`, `role` (`owner` | `member`), `joined_at`; chiave primaria composta.
- `group_features` — `group_id`, `feature_key`, `enabled`: quali moduli usa un gruppo (oggi solo `study`, attivo
  alla creazione).
- Funzioni di supporto riusate da TUTTE le policy, presenti e future: es. `is_group_member(group_id)` e
  `shares_group_with(user_id)`.

**Modulo studio (backend):**
- `study_daily_totals` — `user_id`, `device_id`, `day` (date, giorno locale dell'utente), `seconds`
  (`CHECK 0..86400`), `updated_at`; chiave primaria (`user_id`, `device_id`, `day`). I totali sono **dell'utente**, non
  del gruppo: li vede chiunque condivida almeno un gruppo con lui. Il server somma i dispositivi.

**Tempo reale — canali con nomi a schema fisso:** `group:<group_id>:<feature_key>` (es. `group:<id>:study`).
Una **sola** regola di autorizzazione su Realtime: si entra in `group:<id>:<feature>` solo se si è membri di quel
gruppo e la funzione è attiva. Così un modulo futuro (es. `group:<id>:cinema`) non richiede nuovo codice di sicurezza.

**Lato app:**
- Nuovo modulo `src/core/cloud/` che contiene **tutte e sole** le chiamate a Supabase (client, auth, sync, presenza),
  dietro un'interfaccia nostra: il resto dell'app non importa `@supabase/supabase-js` direttamente. Serve a poter
  cambiare backend in futuro e a rispettare la regola "un solo punto per la rete".
- Un registry dei moduli social, gemello di `widgets/registry.ts`: aggiungere un modulo = cartella + una riga.
- La UI dei gruppi rispetta le regole di dipendenza esistenti (`widgets/<nome>` non importa altri widget). La
  collocazione è decisa in §2; la pagina "Stanza comune" della barra laterale è una feature (`features/`), il widget sta
  in `widgets/gruppi/`, e la logica condivisa tra i due (sale, classifica) sta in `core/cloud` o in un modulo `core/`
  dedicato, non duplicata.
- Nessuna parte di `core/cloud` deve assumere il desktop, tranne l'adattatore di archiviazione del token, che sta
  dietro un'interfaccia (un domani: implementazione mobile).

**Messaggi in tempo reale versionati:** ogni payload ha un campo `v`. Chi riceve una versione che non conosce la
**ignora** senza errori (gli amici aggiorneranno l'app in momenti diversi).

**Migrazioni del database cloud nel repo**: `supabase/migrations/` (Supabase CLI), con le stesse regole di quelle
locali: solo aggiunte in fondo, mai modificare una migrazione rilasciata, nessuna modifica fatta a mano nel pannello.

### 4.2 Flusso di login (Google, desktop)

1. L'app apre il **browser di sistema** (plugin opener) sull'URL di autorizzazione Supabase con **PKCE**.
2. Redirect a un deep link, es. `personaldashboard://auth/callback`.
3. L'app riceve il codice e lo scambia con la sessione.
4. Su Windows il deep link avvia una seconda istanza: serve il plugin **single-instance** con supporto deep link,
   che inoltra l'URL all'istanza aperta.
5. Nella configurazione Supabase gli URL di redirect ammessi devono essere **solo** quelli del deep link (e quello di
   sviluppo, se serve); niente wildcard larghe.
6. La sessione (refresh token) è salvata nel **portachiavi del sistema** (Windows Credential Manager, Keychain di
   macOS) tramite un comando Rust (es. crate `keyring`), usato come storage personalizzato di supabase-js.
   **Mai** in SQLite, `localStorage` o file in chiaro.
7. Primo accesso: schermata per scegliere il nome utente. Logout: cancella la sessione dal portachiavi e chiude i
   canali.

Nota per `docs/GRUPPI.md`: con la schermata di consenso Google in modalità "Testing" solo gli utenti di test aggiunti
a mano possono accedere. Verifica i limiti attuali di questa modalità e spiegami cosa devo fare per gli amici.

### 4.3 Sincronizzazione dei totali

- `device_id`: uuid generato in locale al primo accesso, salvato in `core/db/meta.ts`, registrato in `devices`.
- I totali si **ricalcolano** dal SQLite locale (`study_sessions`) per giorno locale, con la stessa attribuzione al
  giorno usata dal report esistente (`ended_at`), e si fanno **upsert** su `study_daily_totals`. Il caricamento è
  idempotente: ripeterlo non crea doppioni, quindi non serve una coda offline.
- Primo accesso su un dispositivo: ultimi 14 giorni. Poi: giorni toccati da quando è avvenuta l'ultima
  sincronizzazione riuscita (salvata in `meta`), al log di una sessione, al ritorno online e periodicamente.
- Materie e sessioni singole **non** vengono caricate.
- Backend non raggiungibile (offline, oppure progetto Supabase in pausa dopo una settimana di inattività sul piano
  gratuito) = stessa esperienza dell'offline, con un messaggio chiaro ("Gruppi non raggiungibili"), nessun errore a
  catena, nuovi tentativi con backoff.

### 4.4 Presenza in tempo reale

- Canale `group:<id>:study` con **Realtime Presence** (privato, autorizzato come in §4.1).
- Lo stato condiviso riusa il modello del timer (`TimerContext.tsx`): fase (`idle` | `work` | `break`), modalità
  (pomodoro/cronometro), `runningSince`, durata della fase, e la materia **solo** se l'impostazione è attiva.
- Si invia **solo quando lo stato cambia** (avvio, pausa, fine fase, cambio materia) e all'ingresso nel canale,
  **mai** un messaggio al secondo: chi riceve calcola il timer in locale.
- **Correzione dell'orologio**: gli orologi dei PC non coincidono. Calcola uno scarto rispetto all'ora del server
  (es. una funzione che restituisce `now()`) e usalo per inviare e interpretare `runningSince`.
- Classifica live = totale salvato di oggi (o della settimana) + sessione in corso.
- I payload ricevuti vanno **validati** (forma, tipi, intervalli plausibili) prima dell'uso; quelli non validi vengono
  scartati.

### 4.5 Sale e posti (la parte facile da sbagliare)

- **Nessun server decide i posti**: ogni client calcola la disposizione dalla presenza. Il calcolo deve quindi essere
  **deterministico e identico su tutti i computer**, altrimenti due amici vedono disposizioni diverse.
- Ordine stabile: per **istante di ingresso nel canale** (con la correzione dell'orologio di §4.4), a parità per
  `user_id`. Mai ordini che dipendono dall'arrivo dei messaggi o da `Math.random`.
- Il payload di presenza contiene la **sala preferita** (`room`, intero). È una *richiesta*: l'assegnazione la calcola
  l'algoritmo. Regola dei conflitti: si riempiono le sale nell'ordine stabile; chi chiede una sala già piena (8) torna al
  riempimento automatico, quindi a parità vince chi è entrato prima.
- All'avvio `room` vale "prima libera" (non si salva). Spostarsi = aggiornare la propria presenza, nient'altro: niente
  database e niente nuove regole di sicurezza (il canale del gruppo è già autorizzato).
- Capienza (8) come costante condivisa, non sparsa nel codice.
- L'algoritmo è una **funzione pura** (presenze → sale → posti) con test `.mts`: stesso input in ordine diverso
  ⇒ stessa disposizione; conflitto sull'ultimo posto; sala che si svuota; utente che si sposta.

---

## 5. Sicurezza — checklist obbligatoria

1. **RLS attive su ogni tabella**, senza eccezioni; revoca i privilegi di default dove serve. Nessuna tabella
   leggibile da utenti non autenticati.
2. Lettura: profili e totali solo propri o di chi condivide un gruppo; gruppi e membri solo dei propri gruppi.
   Scrittura: solo le proprie righe (totali e dispositivi propri).
3. **Le operazioni sensibili passano da funzioni RPC**, non da insert/update diretti:
   - `create_group` — genera il codice e inserisce l'owner;
   - `join_group(code)` — controlla codice, limite membri e frequenza dei tentativi;
   - `leave_group` — trasferisce la proprietà o elimina il gruppo vuoto;
   - `remove_member` e `regenerate_invite_code` — solo owner;
   - `set_username`;
   - `delete_account`.

   Le funzioni `SECURITY DEFINER` devono avere `SET search_path = ''`, nomi completamente qualificati e controllare
   sempre `auth.uid()`.
4. **Codice invito**: generato dal server con un generatore crittografico, almeno 8 caratteri da un alfabeto senza
   caratteri ambigui (no `0/O`, `1/I/l`), unico, rigenerabile, leggibile **solo** dai membri.
5. **Limite ai tentativi** di `join_group` per utente (es. 10 ogni 10 minuti), così il codice non si indovina per
   tentativi.
6. **Vincoli lato server** su tutto ciò che arriva dal client: lunghezze dei testi, formato del nome utente,
   `seconds` tra 0 e 86400, `day` non nel futuro oltre il fuso orario massimo e non più vecchio di un limite ragionevole.
7. **Realtime solo su canali privati** con autorizzazione sulla tabella `realtime.messages` (policy basata sul topic
   `group:<id>:<feature>`). Disattiva o non usare i canali pubblici.
8. **Nessun dato personale superfluo**: Google fornisce email, nome e avatar, ma nelle tabelle pubbliche non salvarli e
   nella UI non mostrarli. Niente avatar remoti (violerebbero anche la regola "nessuna risorsa da internet").
9. **Testo degli altri mostrato sempre come testo**, mai come HTML (no `dangerouslySetInnerHTML`, niente riuso del
   rendering HTML del Quaderno).
10. **CSP**: oggi `tauri.conf.json` ha `"csp": null`. Imposta una CSP restrittiva che permetta solo il necessario: il
    dominio Supabase (`https://` e `wss://`), Open-Meteo, YouTube (player e immagini) e `http://localhost:14321` su
    macOS. **Testa a mano** che YouTube, Meteo, File Transfer e Quaderno funzionino ancora. Se la CSP rompe qualcosa
    che non sai come sistemare in sicurezza, fermati e chiedi.
11. **Permessi Tauri minimi**: aggiungi a `capabilities/default.json` solo i permessi strettamente necessari ai nuovi
    plugin.
12. **Privacy (GDPR)**:
    - "Elimina account" cancella a cascata profilo, dispositivi, iscrizioni e totali, e l'utente in `auth.users`
      (tramite funzione o meccanismo sicuro lato server, mai con la `service_role` nel client);
    - breve informativa in app su quali dati vengono condivisi e con chi;
    - le impostazioni di condivisione (materie) sono spente di default.
13. **Versioni dei plugin**: il progetto usa `tauri = 2.11.3` e ha già plugin pinnati perché le versioni nuove
    richiedono `^2.12` (vedi `CLAUDE.md`). Per ogni nuovo plugin o crate (deep-link, single-instance, keyring…)
    **verifica sul manifesto pubblicato su crates.io/npm** la compatibilità prima di aggiungerlo, pinna la versione
    esatta se serve e documentalo. Se nessuna versione è compatibile, fermati e proponimi le opzioni (incluso
    aggiornare Tauri).

---

## 6. Fasi

### Fase 0 — Verifiche e piano (niente codice)
- Leggi il codice rilevante: timer, `studyRepository.ts`, `core/db`, impostazioni, registry, `lib.rs`,
  `tauri.conf.json`, `capabilities/`, workflow di release.
- Verifica le compatibilità dei plugin (§5.13) e che supabase-js funzioni nella webview Tauri su Windows e macOS.
- Scrivi `docs/GRUPPI.md` con: architettura, schema, policy previste, flussi, cosa resta locale, limiti accettati
  (anti-cheat, pausa del piano gratuito, nessun backup cloud), e i **passi che devo fare io**:
  1. progetto Supabase in regione UE;
  2. client OAuth Google e consenso in modalità Testing con utenti di test;
  3. secret di Google solo nel pannello di Supabase;
  4. URL di redirect;
  5. `.env.local`;
  6. GitHub Actions Secrets.
- La collocazione della UI è già decisa (§2, "Dove vive la UI"): aggiungere una voce alla barra laterale richiede una
  nuova vista in `core/nav/useNav.ts` (`AppView`); proponimi come farlo senza rompere la navigazione esistente.
- Proponimi la soluzione per i Pixy nella sala (vedi Fase 5) e le eventuali domande aperte. **Fermati.**

### Fase 1 — Backend e test delle regole di accesso
- `.gitignore` e `.env.example` (§3) per primi.
- Migrazioni in `supabase/migrations/`: nucleo, modulo studio, funzioni RPC, policy RLS, autorizzazione Realtime.
- **Test automatici delle policy** (pgTAP con `supabase test db`, su istanza locale via `supabase start`). Devono
  coprire almeno:
  - un utente non autenticato non legge nulla;
  - un non-membro non vede gruppo, membri, codice né totali;
  - un codice errato non fa entrare e i tentativi vengono limitati;
  - il 31° membro viene rifiutato;
  - nessuno scrive i totali di un altro;
  - `seconds` fuori intervallo viene rifiutato;
  - solo l'owner rimuove membri e rigenera il codice;
  - il trasferimento della proprietà va al più anziano e il gruppo vuoto viene eliminato;
  - l'email non è leggibile da altri utenti;
  - `delete_account` cancella tutto.
- Se Docker o la CLI non sono disponibili per eseguire i test, dimmelo invece di saltarli. **Fermati.**

### Fase 2 — Login Google
Deep link, single-instance, PKCE, portachiavi, scelta del nome utente, logout, elimina account, sezione Account
nelle Impostazioni, comportamento senza configurazione o offline. **Fermati.**

### Fase 3 — Sincronizzazione dei totali
`device_id`, ricalcolo e upsert, primi 14 giorni, ultima sincronizzazione in `meta`, nuovi tentativi, stato
"non raggiungibile". Le parti pure (calcolo dei totali per giorno e settimana) devono avere orologio iniettato e uno
script di test `.mts`, come già fatto per altre logiche del progetto. **Fermati.**

### Fase 4 — Presenza in tempo reale
Canale privato, payload versionato e validato, invio solo ai cambi di stato, correzione dell'orologio, impostazione
"mostra materia" (spenta di default, aggiunta in `core/settings/schema.ts`), **sale e posti deterministici (§4.5)**.
Logica pura testabile come sopra. **Fermati.**

### Fase 5 — Interfaccia
- **I mockup approvati esistono** e sono la fonte di verità per questa parte: li metto io in
  `docs/design/temi/gruppi/` (se non ci sono quando arrivi qui, fermati e chiedimeli). Ci sono **8 versioni di ogni
  schermata: 4 temi × versione chiara e scura** (Notte scuro/chiaro, Opaco chiaro/scuro, Quaderno chiaro/scuro, Fosforo
  scuro/chiaro). **Tutte e 8 vanno implementate**: nessuna schermata è finita finché non funziona in tutte e 8, compreso
  il disegno della sala, che cambia colori anche tra chiaro e scuro dello stesso tema. Nel riepilogo della fase elenca le
  8 combinazioni e per ciascuna cosa hai verificato a mano. Le schermate sono:
  1. **Stanza comune** (barra laterale): la sala studio disegnata con tavoli, sedie, finestre e librerie; ogni presente
     è un Pixy seduto, con il timer sopra la testa e la targhetta col nome sul tavolo; **la lampada è lo stato**
     (accesa = studia, luce calda + tazza = pausa, spenta + sedia vuota = posto libero); barra delle sale (frecce,
     "Sala N di M", posti liberi, "Siediti in questa sala"); pannello laterale con i dettagli del posto selezionato
     (sessione in corso, materia se condivisa, oggi, settimana); striscia "Fuori dalla stanza"; selettore dei gruppi,
     "Entra con codice", "Crea gruppo", pulsante Impostazioni della stanza.
  2. **Impostazioni della stanza** (= dettaglio del widget): nome e descrizione, codice invito (copia, rigenera),
     "Cosa vedono gli altri" con l'interruttore della materia e l'informativa, membri con rimozione (solo owner),
     "Abbandona il gruppo" con l'avviso del passaggio di proprietà.
  3. **Widget** 1×1, M, L.
  4. **Finestre**: scelta del nome utente, crea gruppo, entra con codice (con stato di errore).
  5. **Primo accesso** senza account, con "Accedi con Google" e cosa viene condiviso.
  6. **Stati**: accesso in corso nel browser, nessun gruppo, gruppi non raggiungibili.
- La sala è **un disegno diverso per tema**, non solo colori: Notte illustrazione notturna, Opaco blocchi piatti di
  pigmento senza contorni, Quaderno disegno a penna sul foglio a quadretti con la luce a evidenziatore, Fosforo matrice
  di LED con lo studio in LED rosso. Si rende con `useThemeVariant(map)` (`core/theme/variants.ts`), mai con
  `if (theme === …)`; colori solo dai token (aggiungi i token della scena in `tokens.css` **e** `tokens-varianti.css`).
- I mockup caricano i font da Google Fonts solo per comodità: **nell'app si usano i pacchetti `@fontsource` locali** già
  installati (regola "nessuna risorsa da internet").
- Il pigmento del widget in Opaco lo decide il registry (`pigmentFor`): i mockup usano "blu" per la sala e "carta" per
  le impostazioni, segui il registry e segnalami se il risultato si discosta molto.
- **Pixy nella sala**: i mockup usano facce semplificate. Le regole di dipendenza vietano che un widget importi il
  Companion (`widgets/<nome>` non importa altri widget). In Fase 0 proponimi tu: facce semplificate proprie del modulo
  Gruppi, oppure spostare il renderer di Pixy in `core/` o `ui/` (refactor del Companion). Non decidere da solo.
- Accessibilità: ogni posto occupato è un `<button>` con `aria-label` ("giulia.r, sta studiando"); lo stato non è
  affidato solo al colore (c'è sempre anche il testo del timer o "pausa").
- Prima di scrivere la UI, confrontala con i mockup tema per tema; dove non riesci a replicarli dimmelo invece di
  inventare.

**Fermati.**

### Fase 6 — Chiusura
- CSP (§5.10) con test manuali.
- Aggiorna `CLAUDE.md`: le funzioni di gruppo sono la seconda eccezione opzionale alla regola "niente rete" e tutta
  la rete cloud passa solo da `core/cloud`.
- Aggiorna `docs/ARCHITETTURA.md` con la ricetta "come aggiungo un modulo social".
- Controllo finale dei segreti su tutta la cronologia del branch.

---

## 7. Verifica (per ogni fase)
- `npm run build` e `npm run lint` senza errori; `cd src-tauri && cargo check` dopo modifiche Rust.
- `supabase test db` verde dalla Fase 1 in poi.
- Script `.mts` delle logiche pure verdi.
- Checklist di prove manuali scritta nel riepilogo della fase. Ciò che non hai potuto provare (es. login reale senza
  le mie chiavi, macOS) va indicato esplicitamente come **non verificato**.
- Controllo dei segreti (§3.5) prima di ogni commit.