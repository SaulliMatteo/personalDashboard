# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dashboard personale **local-first** per desktop: Tauri v2 + React 19 + Vite + TypeScript + Tailwind v4,
dati in SQLite locale (`@tauri-apps/plugin-sql`, file `dashboard.db`). Codice, commenti e UI sono in **italiano**.
Documentazione di dettaglio: `docs/ARCHITETTURA.md` (mappa, regole, ricette) e `docs/FILE_TRANSFER.md`.

## Comandi

```bash
npm install
npm run tauri dev      # sviluppo (finestra Tauri, compila anche Rust e C)
npm run tauri build    # installer
npm run build          # tsc -b + vite build: è il controllo dei tipi
npm run lint           # oxlint (plugin react/typescript/oxc, vedi .oxlintrc.json)
cd src-tauri && cargo check   # dopo modifiche a Rust o C
```

Non esistono test automatici: si verifica con `npm run build` + `npm run lint` (+ `cargo check`).
Le logiche "pure" (es. `widgets/companion/engine/`, `widgets/youtube/lib/watchTracker.ts`, `core/layout/compactor.ts`)
hanno orologio e random iniettati apposta per poter essere testate senza browser: uno script `.mts` lanciato con
`node` (Node 24 toglie i tipi da solo) può importarle direttamente; se importano altri file senza estensione, prima
si fa un bundle con `npx rolldown`.
Il DB reale è `dashboard.db` nella cartella dati dell'app (Windows: `%APPDATA%\it.matteo.personalDashboard\`), lo
stesso in dev e nell'app installata: se l'installata è aperta lo blocca, chiuderla prima di `npm run tauri dev`.

## Architettura d'insieme

**Albero di avvio** (`src/app/App.tsx`): `DatabaseGate` (esegue le migrazioni, non monta nulla prima) →
`SettingsProvider` → `LayoutProvider` → `BootGate` (tiene la splash di `index.html` finché il layout non è pronto)
→ `WidgetProviders` (monta i `provider` di tutti i widget, sempre attivi anche se il widget non è in dashboard)
→ `NavProvider` → vista corrente. Non c'è un router: la vista (`AppView` in `core/nav/useNav.ts`) è
`dashboard` | `catalog` | `settings` (pagina Impostazioni, `openSettings(sezione)`) | `widgetDetail`, e la pagina
di dettaglio è il `detailComponent` del widget.

**Tutto è guidato dal registry.** `src/widgets/registry.ts` è l'unico elenco dei widget; ogni widget esporta una
`WidgetDefinition` (`core/widgets/types.ts`: taglie, `defaultPlacement`, `detailComponent`, `provider`,
`settingsGroup`, `mini`). Catalogo (che è anche Impostazioni > Widget: la rotellina di una card apre il suo
`settingsGroup`), dashboard, layout di default, provider e scelte degli spazi in alto a destra dell'intestazione
(`mini`, `features/dashboard/HeaderSlots.tsx`) derivano da lì:
aggiungere un widget = cartella `src/widgets/<nome>/` + una riga nel registry.

**Regole di dipendenza**: `app → features, widgets, core`; `features → core, widgets/registry, ui`;
`widgets/<nome> → core, ui` (mai un altro widget); `ui →` niente. I widget comunicano tramite
`core/activity/activityBus.ts`: **stato** (`publishActivity`, sovrascrivibile) ed **eventi** (`emitActivityEvent`,
momentanei), solo in memoria. Il Companion ascolta il bus per reagire a ciò che fanno gli altri widget.
Debito noto: `widgets/youtube/screens/WatchScreen.tsx` importa `study/data/studyRepository.ts` — non replicarlo.

**Dati**:
- SQL solo nei `*Repository.ts` (es. `widgets/study/data/studyRepository.ts`); i componenti non scrivono SQL.
- Schema: migrazioni versionate in `core/db/migrations.ts`, solo **aggiunte in fondo** (`version` = ultima + 1),
  idempotenti (`IF NOT EXISTS`, `INSERT OR IGNORE`); mai modificare una migrazione rilasciata.
- Impostazioni: `core/settings/schema.ts` è l'unica fonte (`DEFAULT_SETTINGS` + `SETTING_DEFS`; il controllo in UI
  compare da solo). Righe chiave/valore, niente migrazioni; valori non validi tornano al default (`sanitizeSettings`).
  Se le opzioni dipendono dal registry (che `core` non può importare) la chiave è `text` nello schema e la pagina
  passa a `SettingsSection` un `overrides` con il select (es. `headerSlot1/2` in `tabs/DashboardTab.tsx`).
- Metadati interni dell'app: store chiave/valore `core/db/meta.ts`, non le impostazioni.

**Backend nativo** (`src-tauri/`): `src/lib.rs` registra plugin (sql, notification, fs/dialog/opener usati dal
Quaderno, log in debug) e comandi, e crea la finestra `main` (in `tauri.conf.json` ha `create: false`).
- File Transfer: server HTTP in C (`filetransfer/c/`; Winsock su Windows, socket POSIX su macOS/Linux, tutte le
  differenze in `platform.h`), compilato da `build.rs` con `cc` (che imposta `cfg(ft_native)`), esposto con i comandi
  `ft_*` di `src/file_transfer.rs`; va fermato alla chiusura della finestra. Su macOS la 5000 è di AirPlay: il server
  prova le porte successive.
- Companion (Pixy): `companion_snapshot` in `src/companion.rs` (inattività, app in primo piano e descrizione
  dell'eseguibile via `windows-sys`; su macOS inattività da CoreGraphics e app via `NSWorkspace`, con il bundle `.app`
  come "processo" e titolo vuoto). Lato frontend la catena è `core/system/appCategory.ts` (classifica l'app; con
  `core/system/systemApi.ts` serve anche allo stop automatico dello Studio, `study/timer/autoStop.ts`) →
  `engine/brain.ts` (sceglie la posa, puro) → `engine/poses.ts` (com'è fatta, con varianti per personalità) →
  `engine/animator.ts` (fotogrammi) → `render/` (campo SDF della faccia + costumi; LED in Fosforo, pieno negli altri temi).
- Notifiche: tutte da `core/notify/notifier.ts` (`sendAppNotification` con un `kind`), mai dal plugin direttamente.
  Il Companion registra un decoratore che le firma Pixy (faccia nello stile del tema, emoji, frase della personalità,
  `widgets/companion/notify/`); su Windows il toast con l'immagine lo mostra il comando `notify_with_image`
  (`src/notify.rs`, `tauri-winrt-notification`), altrove si ripiega sul plugin senza immagine.
- Lato frontend, ogni widget chiama `invoke()` da un solo file `data/*Api.ts` (i segnali di sistema condivisi da
  `core/system/systemApi.ts`, le notifiche con immagine da `core/notify/notifyApi.ts`); allo stesso modo l'unica chiamata
  in rete (`fetch`) è `widgets/weather/data/weatherApi.ts`.
- Sui sistemi non supportati (oggi: oltre Windows e macOS, il Companion su Linux) l'app deve compilare e i widget
  mostrano un errore chiaro.
- Release: `.github/workflows/release.yml` (tag `v*` o avvio manuale) compila `.dmg` universale + installer Windows
  in una Release in bozza. macOS con firma ad-hoc (niente account Apple): istruzioni di sblocco nel README.

**Temi e stile**: 4 temi (`core/theme/themes.ts`), scelti con `data-theme` su `<html>`; ogni tema ridefinisce i
token di `src/styles/tokens.css` (colori, `--card-*`, `--panel-*`, `--radius-*`, `--font-display`, `--btn-*`…).
Ogni tema ha due varianti, giorno e notte (`data-mode`, impostazione `themeMode` con `auto` che segue il sistema):
cambiano solo i colori. La variante nativa sta in `tokens.css`, l'altra in `tokens-varianti.css` (un token nuovo va
in entrambi). Il codice legge il tema risolto con `useTheme()` (`mode`, `accent`…), mai `themeMode`.
Quando un pezzo cambia *forma* per tema si usa `useThemeVariant(map)` (`core/theme/variants.ts`), mai
`if (theme === …)`; le varianti-componente si rendono con `createElement` (lint `static-components`). Le card per
tema dei widget stanno in `card/cards.ts` e le pagine di dettaglio riusano la card M. In Opaco ogni widget ha un
pigmento (`data-pigment` sulla cella e su `.detail-scope`) che ridefinisce i token. Un `.css` accanto a ogni
componente, niente CSS globale fuori da `src/styles/`. `.main` in `AppShell` è l'unico elemento che scrolla.

## Regole

- Se non sei sicuro chiedi sempre conferme e chiarimenti, non cercare di indovinare a caso.
- Nessuna risorsa caricata da internet a runtime (font compresi: pacchetti `@fontsource` locali).
  Unica eccezione, opzionale: i dati del widget Meteo (Open-Meteo), solo se l'utente imposta la città e lo usa.

## Design

- I mockup approvati sono in `docs/design/temi/` e sono la fonte di verità per la grafica:
  l'app deve risultare identica. Se codice e mockup non concordano, vale il mockup.
- Ogni colore viene dai token del tema: niente esadecimali nei componenti (eccezione: colori scelti dall'utente,
  come materie e cartelle).
- Ogni nuovo widget deve funzionare in tutti e 4 i temi (Notte, Opaco, Quaderno, Fosforo), giorno e notte, e avere una taglia 1×1
  ultra minimal (vedi `docs/design/temi/widget-1x1.html`).
- Anche le pagine di dettaglio dei widget usano il linguaggio completo del tema (parti per tema, non solo colori).

## Lavori in corso

- Redesign dei temi (branch `feat/temi`): istruzioni complete in `temi-dashboard/docs/prompt-temi-claude-code.md`.
  Leggilo solo quando lavori su questo redesign.

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
- Valori "ultimi" in interval/listener di lunga durata → `core/hooks/useLatestRef.ts`.
- Contesti: `XContext.tsx` esporta solo il provider; contesto, tipo e hook in `useX.ts` (es. `useSettings.ts`).
- `tauri-plugin-notification` è pinnato `=2.4.0` (e `tauri-winrt-notification` `=0.8.1`, la versione che usa) perché la 2.5 richiede `tauri ^2.12` (il progetto usa `2.11.3`):
  non aggiornarlo senza controllare il manifesto su crates.io. Idem `tauri-plugin-localhost` (`=2.3.1`, la 2.4 vuole `^2.12`).
- Su macOS l'app installata serve il frontend da `http://localhost:14321` (`tauri-plugin-localhost`, `src/lib.rs`):
  da `tauri://localhost` YouTube rifiuta il player (errore 153, niente referrer). La porta è anche in
  `capabilities/default.json` (`remote.urls`, senza la pagina perde l'IPC): cambiarla in entrambi i posti.
- Le notifiche mostrano il nome dell'app solo nella versione installata; in `tauri dev` Windows le attribuisce a PowerShell.
- La pagina web servita all'iPad (`src-tauri/filetransfer/public/`) è un build copiato da un progetto esterno:
  non modificarla a mano (vedi `docs/FILE_TRANSFER.md`).
- I file sono UTF-8; PowerShell 5.1 con `Get-Content` mostra le accentate storte anche se sono corrette.
- Git: si lavora su `dev`, PR verso `main`.
