# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dashboard personale **local-first** per desktop e Android: Tauri v2 + React 19 + Vite + TypeScript + Tailwind v4,
dati in SQLite locale (`@tauri-apps/plugin-sql`, file `dashboard.db`). Codice, commenti e UI sono in **italiano**.
`docs/` (documentazione, mockup, prompt) è **solo locale**: è nel `.gitignore` e fuori dalla cronologia del repo
pubblico, come `CLAUDE.local.md`. Il `README.md` è per chi scarica l'app (installazione, dati, privacy), non per chi
sviluppa: le note per lo sviluppo stanno qui e nei `CLAUDE.md` delle cartelle (vedi "Note per area").

## Regole

- Se non sei sicuro chiedi sempre conferme e chiarimenti, non cercare di indovinare a caso.
- Nessuna risorsa caricata da internet a runtime (font compresi: pacchetti `@fontsource` locali). Eccezioni, tutte
  opzionali:
  - i dati del widget Meteo (Open-Meteo), solo se l'utente imposta la città e lo usa; unica `fetch`:
    `widgets/weather/data/weatherApi.ts`;
  - i Gruppi (Supabase, regione UE), solo se la build ha `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` e l'utente
    accede con Google. Senza, l'app resta solo locale ("Gruppi non configurati"); con il server irraggiungibile
    funziona tutto il resto. Tutta questa rete passa da `core/cloud/`, l'unico che importa `@supabase/supabase-js`.
    Segreti mai nel repo: vedi `docs/GRUPPI.md`;
  - gli aggiornamenti dell'app (`latest.json` e pacchetto dalle Release di GitHub): `latest.json` al massimo una volta
    al giorno se è acceso `autoCheckUpdates` (`core/updater/autoCheck.ts`), oppure con "Controlla aggiornamenti"; il
    pacchetto solo con "Aggiorna". Tutto da `core/updater/updaterApi.ts` (la rete la fa il plugin in Rust: niente CSP).
- I mockup approvati in `docs/design/` (`temi/`, `mobile/`, `amici-notifiche.html`) sono la fonte di verità per la
  grafica: l'app deve risultare identica. Se codice e mockup non concordano, vale il mockup.
- Ogni colore viene dai token del tema: niente esadecimali nei componenti (eccezione: colori scelti dall'utente, come
  materie e cartelle).
- Ogni nuovo widget deve funzionare in tutti e 4 i temi (Notte, Opaco, Quaderno, Fosforo), giorno e notte, e avere una
  taglia 1×1 ultra minimal. Anche le pagine di dettaglio usano il linguaggio completo del tema (parti per tema, non
  solo colori).
- Git: si lavora su `dev`, PR verso `main`.

## Comandi

```bash
npm install
npm run tauri dev      # sviluppo (finestra Tauri, compila anche Rust e C)
npm run tauri build    # installer
npm run build          # tsc -b + vite build: è il controllo dei tipi
npm run lint           # oxlint (plugin react/typescript/oxc, vedi .oxlintrc.json); ~600 avvisi già noti
                       # (quasi tutti della pagina iPad impacchettata): il controllo è "nessun avviso nuovo"
cd src-tauri && cargo check   # dopo modifiche a Rust o C
```

Servono Node (LTS), Rust e i prerequisiti di Tauri v2 per il sistema. Android: `src-tauri/gen/android/CLAUDE.md`.

## Verifica e prove

Non c'è un test runner né la CI di test: si verifica con `npm run build` + `npm run lint` (+ `cargo check`), più le
prove dell'area toccata. Sono script `.mts` lanciati con `node` (Node 24 toglie i tipi da solo); se importano file
senza estensione, prima un bundle con `npx rolldown`:

```bash
npx rolldown scripts/gruppi/chat.test.mts --file node_modules/.tmp/gruppi-chat.test.mjs --platform node
node node_modules/.tmp/gruppi-chat.test.mjs
```

| Se tocchi | Prova |
|---|---|
| `social/`, `core/cloud/`, `supabase/` | `scripts/gruppi/<modulo>.test.mts` (chat, presence, room, leaderboard, friends, chatCards, sync, subjects, todo, pixy); pgTAP se tocchi il server |
| `core/sync/` o una tabella sincronizzata | `scripts/sync/records.test.mts`, `schema.test.mts` (SQLite vero, migrazioni da zero), `round.test.mts` |
| `widgets/notes/sync/filePlan.ts` | `scripts/sync/files.test.mts` |
| `widgets/youtube/lib/recommender.ts` | `scripts/youtube/recommender.test.mts` |
| `core/layout/mobileLayout.ts` | `scripts/layout/mobileLayout.test.mts` |
| `widgets/study/timer/phases.ts` | `scripts/study/phases.test.mts` |
| `widgets/study/lib/` | `scripts/studio/` (piano settimanale, Prospettiva) |
| `core/notify/inbox.ts` | `scripts/notify/inbox.test.mts` |

```bash
# Server dei Gruppi (Supabase locale, serve Docker): migrazioni in supabase/migrations/, test pgTAP in
# supabase/tests/database/ (helper condivisi in _aiuti.psql)
npx supabase start
npx supabase db reset      # riapplica le migrazioni da zero
npx supabase test db       # tutti i file pgTAP
```

Su Windows le porte 5432x di Supabase locale possono cadere nell'intervallo riservato da `winnat` ("bind forbidden"):
`net stop winnat` + `net start winnat` da amministratore.
Le logiche "pure" (es. `widgets/companion/engine/`, `core/pixy/engine/`, `widgets/youtube/lib/watchTracker.ts`,
`core/layout/compactor.ts`) hanno orologio e random iniettati apposta per essere provate senza browser.
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
`settingsGroup`, `mini`, `phoneSizes`, `chatActions`, `roomControls`). Catalogo (che è anche Impostazioni > Widget: la
rotellina di una card apre il suo `settingsGroup`), dashboard, layout di default, provider, spazi in alto a destra
dell'intestazione (`mini`, `features/dashboard/HeaderSlots.tsx`) e comandi nell'intestazione della Stanza comune
(`roomControls`, raccolti in `app/App.tsx` e passati a `RoomPage`: così `social` non importa i widget) derivano da lì:
aggiungere un widget = cartella `src/widgets/<nome>/` + una riga nel registry. Ricette in `docs/ARCHITETTURA.md`.

**Regole di dipendenza**: `app → features, widgets, social, core`; `features → core, widgets/registry, ui`;
`widgets/<nome> → core, ui` (mai un altro widget); `social → core, ui` (legge i widget solo dal bus e dal DB in sola
lettura); `widgets/registry → social` solo per registrare il widget Gruppi; `ui →` niente.
Le voci che `features` non può importare (es. "Stanza comune" nella barra laterale) gliele passa `app/`.
I widget comunicano tramite `core/activity/activityBus.ts`: **stato** (`publishActivity`, sovrascrivibile) ed
**eventi** (`emitActivityEvent`, momentanei), solo in memoria. Il Companion ascolta il bus per reagire agli altri.
Debito noto: `widgets/youtube/screens/WatchScreen.tsx` importa `study/data/studyRepository.ts` — non replicarlo.

**Dati**:
- SQL solo nei `*Repository.ts` (es. `widgets/study/data/studyRepository.ts`); i componenti non scrivono SQL.
- Schema: migrazioni versionate in `core/db/migrations.ts`, solo **aggiunte in fondo** (`version` = ultima + 1),
  idempotenti (`IF NOT EXISTS`, `INSERT OR IGNORE`); mai modificare una migrazione rilasciata. Il runner
  (`core/db/index.ts`) guarda solo `PRAGMA user_version`: due rami che usano lo stesso numero si scontrano al merge, e
  un DB già passato da quel numero salta l'altra migrazione. Si rinumera la parte non rilasciata e si aggiunge una
  migrazione di "riparazione" che riesegue quella saltata (es. la v16).
- **Tabelle sincronizzate** (`SYNC_TABLES` in `core/sync/tables.ts`: Studio, Note, Raccolte, impostazioni): una colonna
  nuova va aggiunta ai trigger (migrazione nuova con DROP/CREATE TRIGGER) e in `tables.ts`, altrimenti non viaggia
  tra i dispositivi. Dettagli in `src/core/sync/CLAUDE.md`.
- Impostazioni: `core/settings/schema.ts` è l'unica fonte (`DEFAULT_SETTINGS` + `SETTING_DEFS`; il controllo in UI
  compare da solo). Righe chiave/valore, niente migrazioni; valori non validi tornano al default (`sanitizeSettings`).
  Se le opzioni dipendono dal registry (che `core` non può importare) la chiave è `text` nello schema e la pagina
  passa a `SettingsSection` un `overrides` con il select (es. `headerSlot1/2` in `tabs/DashboardTab.tsx`).
  Del singolo dispositivo (non sincronizzate): `PER_DEVICE_SETTINGS`. Solo desktop: `desktopOnly`; solo dove ci sono i
  segnali di sistema (Windows e macOS): `systemSignals`; testi diversi su Android: `android: { label, description }`.
- Metadati interni dell'app: store chiave/valore `core/db/meta.ts`, non le impostazioni.

**Backend nativo** (`src-tauri/`, dettagli in `src-tauri/CLAUDE.md`): `src/lib.rs` registra plugin e comandi e crea
la finestra `main` (in `tauri.conf.json` ha `create: false`). Lato frontend ogni widget chiama `invoke()` da un solo file
`data/*Api.ts` (segnali di sistema condivisi da `core/system/systemApi.ts`). Un comando nuovo va in
`generate_handler!`, nel manifesto di `build.rs` e come `allow-<comando>` in `capabilities/default.json` (desktop) /
`mobile.json` (Android): su macOS la pagina è un'origine remota e senza ACL il comando viene rifiutato.
La finestra principale naviga solo dentro l'app (`on_navigation` + `is_app_url`): un link esterno si apre nel browser
di sistema, mai nella webview che ha accesso ai comandi. CSP in `tauri.conf.json` (`csp` e `devCsp`): un dominio nuovo
va aggiunto in entrambe. Sui sistemi non supportati (oggi: Linux) l'app deve compilare e i widget mostrano un errore
chiaro.

**File Transfer, difese da non togliere.** Il server HTTP in C (`src-tauri/filetransfer/c/`) è esposto sulla rete
locale senza autenticazione (la pagina dell'iPad non si può cambiare), quindi le difese stanno tutte nel C (`http.c`):
niente header CORS e `Origin` uguale a `http://<Host>` (un sito aperto nel browser non può caricare file), `Host` solo
IPv4 o `localhost` (DNS rebinding), `X-File-Name` obbligatorio (niente richieste "semplici" senza preflight), nomi di
file sicuri (anche quelli riservati di Windows), mai sovrascrivere (`"wbx"`, poi "nome (1).ext"), file a metà
cancellati, al massimo 64 GB, 32 connessioni e 30 s di silenzio. Il comando di invio di Android
(`src/file_send.rs`) accetta solo URI `content://` del selettore e IPv4 privati: non deve poter mandare file dell'app
né uscire su internet scavalcando la CSP.

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

## Telefono e tocco: regole per ogni componente

Il layout è "compatto" (telefono) quando il lato corto della finestra è sotto i 600 dp (`core/layout/useCompact.ts`;
i CSS usano `:root[data-compact]`); tablet e desktop restano nel layout desktop. Il resto in
`src/core/layout/CLAUDE.md`. Valgono per ogni componente nuovo:
- un dialogo o menu ha `role="dialog"`/`aria-modal`/`role="menu"` e si chiude con Esc (l'indietro di Android passa da
  `core/nav/overlays.ts`, che manda Esc), e va aggiunto alle liste di overlay/dialogo/azioni di `styles/base.css`
  (sul telefono diventa un foglio dal basso);
- ciò che compare solo col mouse va mostrato anche in `@media (hover: none)`; le aree toccabili sotto i 44px si
  allargano con un `::after` invisibile e `inset: var(--hit)` dentro `@media (pointer: coarse)`; niente scorciatoie
  da tastiera suggerite con `useTouchOnly()`;
- i caratteri piccoli delle pagine si scrivono `max(Npx, var(--fs-min))` (13px sul telefono, 0 altrove);
- col dito si trascina solo dopo una pressione lunga: un tocco apre, uno scorrimento scorre;
- la WebView di Android non conosce `scrollbar-width`: una barra stilizzata con `::-webkit-scrollbar` va tolta a mano.

## Convenzioni e insidie

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
- `<select>` nativi: il menu aperto lo disegna il sistema, quindi `color-scheme: inherit` sul select e sfondo pieno
  sulle `option` (`--modal-bg`); `--panel-bg` non va bene, in Fosforo è trasparente e il menu esce bianco.
- Valori "ultimi" in interval/listener di lunga durata → `core/hooks/useLatestRef.ts`.
- Contesti: `XContext.tsx` esporta solo il provider; contesto, tipo e hook in `useX.ts` (es. `useSettings.ts`).
- Testi con "Ctrl": `modKeyLabel()` di `core/system/platform.ts`. Click sui link esterni: `core/system/externalLinks.ts`.
- `tauri` e diversi plugin sono pinnati a versioni esatte (le successive vogliono `tauri ^2.12`): non aggiornarli
  senza leggere `src-tauri/CLAUDE.md`.
- `@excalidraw/excalidraw` (Lavagna) è pinnato `0.18.1`: i font si servono offline da `public/excalidraw-assets/fonts/`
  (copiati da `scripts/copy-excalidraw-assets.mjs` in `predev`/`prebuild`, `EXCALIDRAW_ASSET_PATH` in
  `widgets/whiteboard/lib/excalidrawAssets.ts`) e cartelle/nomi dei font cambiano tra versioni; se manca un file
  Excalidraw ripiega su esm.sh. Aggiornandolo, ricontrollare che nessuna richiesta esca in rete.
- La pagina web servita all'iPad (`src-tauri/filetransfer/public/`) è un build copiato da un progetto esterno:
  non modificarla a mano (vedi `docs/FILE_TRANSFER.md`).
- I file sono UTF-8; PowerShell 5.1 con `Get-Content` mostra le accentate storte anche se sono corrette.

## Note per area

Claude Code li legge da solo quando lavora su un file di quella cartella; leggili prima se il lavoro tocca l'area da
un'altra parte.

| Area | File |
|---|---|
| Backend nativo, macOS, release, aggiornamenti, versioni pinnate | `src-tauri/CLAUDE.md` |
| Android: build, APK firmato, plugin nativi, `MainActivity` | `src-tauri/gen/android/CLAUDE.md` |
| Interfaccia del telefono (dashboard a pagine, fogli, editor del Quaderno) | `src/core/layout/CLAUDE.md` |
| Sync tra dispositivi (righe e file) | `src/core/sync/CLAUDE.md` |
| Gruppi, Amici, schede nella chat, presenza | `src/social/CLAUDE.md` (stato e decisioni: `docs/GRUPPI.md`) |
| Notifiche e timer dello Studio | `src/core/notify/CLAUDE.md` |
| File Transfer (iPad) | `docs/FILE_TRANSFER.md` |
