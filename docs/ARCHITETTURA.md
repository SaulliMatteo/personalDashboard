# Architettura

## Mappa delle cartelle

```
src/
├─ main.tsx                  entry point: importa gli stili e monta <App/>
├─ app/                      guscio dell'applicazione
│   ├─ App.tsx               albero dei provider + vista corrente
│   ├─ DatabaseGate.tsx      non monta nulla finché le migrazioni DB non sono finite
│   ├─ BootGate.tsx          tiene la splash finché il layout non è pronto (failsafe 10 s)
│   ├─ splash.ts             controllo della schermata di avvio definita in index.html
│   └─ AppShell.tsx / shell.css   sidebar + area contenuto (.main è l'UNICO che scrolla)
├─ core/                     infrastruttura, NON conosce nessun widget specifico
│   ├─ db/                   client SQLite, migrazioni versionate, store chiave/valore "meta"
│   ├─ settings/             schema.ts = UNICA fonte di verità delle impostazioni
│   ├─ layout/               griglia: contesto, repository, compactor (spinta ritardata)
│   ├─ nav/                  vista corrente (dashboard / catalogo / dettaglio widget / impostazioni / stanza comune)
│   ├─ cloud/                UNICO punto con Supabase (account, gruppi, totali, presenza, orologio): docs/GRUPPI.md
│   ├─ theme/                themes.ts (i 4 temi × giorno/notte, pigmenti Opaco, ACCENT_PRESETS), variants.ts (useThemeVariant),
│                            useTheme.ts (tema con la variante risolta), useSystemDark.ts (prefers-color-scheme)
│   ├─ widgets/              tipi (WidgetDefinition), taglie, WidgetFrame (cornice comune)
│   ├─ activity/             bacheca delle attività: i widget pubblicano (studio, video, file)
│   │                        e chi vuole ascolta, senza importarsi a vicenda
│   │                        (lo Studio pubblica anche studyTodaySeconds/Spans per intestazione e sidebar)
│   ├─ system/               systemApi.ts: invoke("companion_snapshot") → src-tauri/src/companion.rs (inattività
│   │                        di sistema + app in primo piano; Windows, macOS); appCategory.ts: app → categoria
│   │                        (pura). Li usano il Companion e lo stop automatico dello Studio
│   ├─ notify/               notifier.ts: UNICO punto da cui partono le notifiche (sendAppNotification); un
│   │                        decoratore registrato dal Companion le firma Pixy. notifyApi.ts: invoke
│   │                        "notify_with_image" (src-tauri/src/notify.rs, toast con immagine su Windows)
│   ├─ report/               periods.ts: periodi (settimana/mese/anno) e barre per i grafici di report
│   └─ hooks/                hook generici (useLatestRef, useNow)
├─ features/                 schermate dell'app (dashboard + intestazione, sidebar,
│                            settings/SettingsPage.tsx: pagina Impostazioni con le schede in tabs/;
│                            settings/catalog/: le card del catalogo, usate dalla scheda Widget e dalla pagina catalogo)
├─ widgets/                  un widget = una cartella
│   ├─ registry.ts           l'UNICO elenco dei widget
│   ├─ WidgetProviders.tsx   monta i provider richiesti dai widget
│   ├─ study/                widget Studio (vedi sotto)
│   ├─ filetransfer/         widget File Transfer (vedi docs/FILE_TRANSFER.md)
│   ├─ youtube/              widget YouTube (vedi sotto)
│   ├─ notes/                widget Quaderno (vedi sotto)
│   ├─ companion/            widget Companion (vedi sotto)
│   ├─ clock/, date/         Orario e Giorno: solo 1×1 + mini dell'intestazione
│   └─ weather/              Meteo (Open-Meteo, opzionale): 1×1 + mini, provider con cache
├─ social/                   i Gruppi (opzionali, docs/GRUPPI.md)
│   ├─ registry.ts / types.ts  l'UNICO elenco dei moduli social (SocialModule, gemello di WidgetDefinition)
│   ├─ SocialProviders.tsx   monta GroupsProvider e i provider dei moduli
│   ├─ groups/               il nucleo lato UI: gruppi, membri, gruppo scelto, azioni, finestre, stati
│   ├─ presence/             comune ai moduli: hub dei canali di presenza (puro), orologio del server
│   ├─ modules/study/        Studio insieme: invio dei totali, presenza del timer, classifica
│   ├─ modules/pixy/         i Pixy di tutti: aspetto sempre, espressioni e fumetti solo se condivisi
│   ├─ widget/               il widget Gruppi (registrato in widgets/registry.ts) e "Impostazioni della stanza"
│   └─ room/                 la Stanza comune (vista "room"): sale da 8 posti con i Pixy veri
├─ ui/                       componenti riusabili senza logica di dominio
│                            (BackButton, ConfirmButton, NumberField, BorderGlow, ProgressBar per tema)
└─ styles/                   tokens.css (colori/raggi/font, varianti native), tokens-varianti.css
│                            (le altre varianti giorno/notte), base.css, tailwind.css
```

### Il widget Studio (`widgets/study/`)

```
study/
├─ index.ts                  WidgetDefinition (nome, taglie, provider, pagina di dettaglio)
├─ StudyWidget.tsx/.css      widget in dashboard (1x1 anello aperto, 2x2 con elenco materie)
├─ StudyDetail.tsx/.css      pagina a schermo intero: scheda Timer e scheda Report
├─ detail/                   TimerTab, SubjectList, ReportTab (+ css accanto)
├─ components/               TimerRing, ModeToggle, SubjectSettingsPopup, NumberField
├─ timer/                    TimerContext (stato e logica), useTimerView (come si DISEGNA il timer),
│                            alerts.ts (suono di fine fase), autoStop.ts (quando fermarsi da solo:
│                            inattività o app che distrae, puro con orologio iniettato)
├─ data/studyRepository.ts   tutte le query SQL di Studio
└─ lib/                      format.ts, colors.ts, report.ts (funzioni pure)
```

### Il widget YouTube (`widgets/youtube/`)

```
youtube/
├─ index.ts                  WidgetDefinition (taglie 2×1, 1×1, 1×2, 3×2; nessun provider: il video si ferma
│                            lasciando la pagina, la posizione viene salvata)
├─ YoutubeWidget.tsx/.css    widget in dashboard
├─ YoutubeDetail.tsx/.css    pagina con tre schermate: HomeScreen, LibraryScreen, WatchScreen
├─ screens/                  le tre schermate
├─ components/               player, righe/miniature video, cartelle, dialoghi, NotesPanel (appunti a tempo)
├─ hooks/useYoutubeData.ts   cartelle e video tutti in memoria, reload() dopo ogni modifica
├─ data/youtubeRepository.ts tutte le query SQL di YouTube
└─ lib/                      funzioni pure: youtube.ts (URL/id), library.ts, notes.ts, folderOptions.ts,
                             watchTracker.ts (conta i secondi in riproduzione, orologio iniettato),
                             studyLink.ts (cartella ↔ materia con lo stesso nome), launch.ts (widget → video da aprire)
```

Il tempo di visione può essere registrato come studio nella materia che ha lo stesso nome della
cartella del video. **Debito noto**: `screens/WatchScreen.tsx` importa direttamente
`study/data/studyRepository.ts`, violando la regola "un widget non importa un altro widget".
Va spostato in `core/` (o fatto passare dall'activityBus) quando si tocca quella parte.

### Il widget Quaderno (`widgets/notes/`)

```
notes/
├─ index.ts                  WidgetDefinition (taglie 3×1, 1×1, 2×2)
├─ NotesWidget.tsx/.css      widget in dashboard
├─ NotesDetail.tsx/.css      pagina: cartelle a sinistra, elenco note, editor
├─ components/               FolderPanel, FolderTree, NoteCollection, NoteEditor,
│                            PageSurface (pagina di carta: contentEditable NON controllato da React),
│                            InkLayer (canvas per penna/evidenziatore/gomma)
├─ data/notesRepository.ts   tutte le query SQL (note_folders, notes, note_pages)
└─ lib/                      drag.ts, editorDom.ts, folders.ts, html.ts (sanitizeHtml)
```

### Il widget Companion (`widgets/companion/`)

```
companion/
├─ index.ts                  WidgetDefinition (taglie 1×1, 2×1, 2×2; provider; pagina)
├─ CompanionContext.tsx      UN cervello + UN animatore per tutta l'app; polling dei segnali
│                            di sistema; tutti i canvas leggono lo stesso fotogramma
├─ CompanionWidget.tsx/.css  widget in dashboard
├─ CompanionDetail.tsx/.css  pagina: anteprima, personalità, animazioni on/off, impostazioni
├─ components/CompanionFace  il Companion con il canvas comune (core/pixy/PixyFace.tsx) + fumetto
├─ engine/                   logica PURA, testabile senza browser
│   ├─ brain.ts              decide umore, sguardo, reazioni, fumetti (orologio e random iniettati)
│   ├─ animations.ts         catalogo delle animazioni accendibili/spegnibili
│   └─ subjectKind.ts        nome della materia → tipo (matematica, scienze, lingue…)
├─ notify/                   notifiche firmate da Pixy: pixyNotifications.ts (espressione, emoji, frase per tipo,
│                            puro), renderNotificationFace.ts (faccia nello stile del tema → PNG)
└─ (segnali di sistema e categorie delle app: core/system/, condivisi con lo Studio)

(motore e disegno di Pixy stanno in core/pixy/, così li usano anche i Gruppi per i Pixy dei compagni:)
core/pixy/
├─ PixyFace.tsx/.css         canvas + ciclo di disegno (~30 fps) + fumetto, per qualunque sorgente di fotogrammi
├─ engine/                   logica PURA: face.ts (parametri ed emozioni), animator.ts (interpola, battiti di ciglia,
│                            sguardo, respiro), personalities.ts (frasi, ritmo, ritocchi), poses.ts (pose e varianti),
│                            snapshot.ts (BrainSnapshot: lo stato del cervello che serve per animare)
└─ render/                   stili grafici: ledRenderer.ts (matrice LED), solidRenderer.ts, styles.ts (registro);
                             costumes.ts (forme dei costumi: fiamma, coperta, libro…) e sdf.ts (distanze)
```

Dati che Pixy legge dall'activityBus oltre a studio e video: `studySubjectName` (Studio), `weatherTemperature`
(Meteo, solo se il widget scarica il dato), `videoPaused`/`videoProgress`/`videoDurationSeconds` (player YouTube).

Flusso: eventi/stato (activityBus, sistema, mouse) → `brain` (poche volte al minuto) →
`animator` (ogni fotogramma) → `render/<stile>` (disegna i parametri).
Per un nuovo stile grafico basta un renderer che disegni gli stessi parametri.

## Regole di dipendenza (non violarle)

```
app  →  features, widgets, social, core
features  →  core, widgets/registry, ui
widgets/<nome>  →  core, ui          (mai features, mai un altro widget)
widgets/registry  →  social          (solo per registrare il widget Gruppi)
social  →  core, ui                  (mai un widget: li legge dall'activityBus e dal DB in sola lettura)
core  →  ui (solo WidgetFrame→BorderGlow) e widgets/registry (solo per il layout di default)
ui  →  niente
```

Un widget non importa mai un altro widget: se due widget condividono qualcosa, quel qualcosa
sale in `core/` o `ui/`.

## Ricette

### Aggiungere un widget
1. Crea `src/widgets/<nome>/` con il componente (riceve `{ w, h }` = taglia in celle) e un `index.ts`
   che esporta una `WidgetDefinition` (id, name, description, component, sizes, …).
2. Aggiungilo in `src/widgets/registry.ts`.
   Catalogo (Impostazioni > Widget e pagina catalogo), dashboard, layout di default e provider si aggiornano da soli.
3. Opzionali: `detailComponent` (pagina aperta cliccando il widget), `provider` (contesto sempre attivo),
   `settingsGroup` (gruppo di impostazioni aperto dalla rotellina della sua card nel catalogo), `defaultPlacement`.

### Aggiungere un modulo social (una cosa da fare insieme nei Gruppi)
Esempio già fatto: `social/modules/pixy/` (migrazione `supabase/migrations/…_pixy.sql`, prove `scripts/gruppi/pixy.test.mts`).
1. **Server**: una migrazione nuova in fondo a `supabase/migrations/` (mai modificarne una già applicata) che accende la
   `feature_key` (`^[a-z][a-z0-9_]{1,30}# Architettura

## Mappa delle cartelle

```
src/
├─ main.tsx                  entry point: importa gli stili e monta <App/>
├─ app/                      guscio dell'applicazione
│   ├─ App.tsx               albero dei provider + vista corrente
│   ├─ DatabaseGate.tsx      non monta nulla finché le migrazioni DB non sono finite
│   ├─ BootGate.tsx          tiene la splash finché il layout non è pronto (failsafe 10 s)
│   ├─ splash.ts             controllo della schermata di avvio definita in index.html
│   └─ AppShell.tsx / shell.css   sidebar + area contenuto (.main è l'UNICO che scrolla)
├─ core/                     infrastruttura, NON conosce nessun widget specifico
│   ├─ db/                   client SQLite, migrazioni versionate, store chiave/valore "meta"
│   ├─ settings/             schema.ts = UNICA fonte di verità delle impostazioni
│   ├─ layout/               griglia: contesto, repository, compactor (spinta ritardata)
│   ├─ nav/                  vista corrente (dashboard / catalogo / dettaglio widget / impostazioni / stanza comune)
│   ├─ cloud/                UNICO punto con Supabase (account, gruppi, totali, presenza, orologio): docs/GRUPPI.md
│   ├─ theme/                themes.ts (i 4 temi × giorno/notte, pigmenti Opaco, ACCENT_PRESETS), variants.ts (useThemeVariant),
│                            useTheme.ts (tema con la variante risolta), useSystemDark.ts (prefers-color-scheme)
│   ├─ widgets/              tipi (WidgetDefinition), taglie, WidgetFrame (cornice comune)
│   ├─ activity/             bacheca delle attività: i widget pubblicano (studio, video, file)
│   │                        e chi vuole ascolta, senza importarsi a vicenda
│   │                        (lo Studio pubblica anche studyTodaySeconds/Spans per intestazione e sidebar)
│   ├─ system/               systemApi.ts: invoke("companion_snapshot") → src-tauri/src/companion.rs (inattività
│   │                        di sistema + app in primo piano; Windows, macOS); appCategory.ts: app → categoria
│   │                        (pura). Li usano il Companion e lo stop automatico dello Studio
│   ├─ notify/               notifier.ts: UNICO punto da cui partono le notifiche (sendAppNotification); un
│   │                        decoratore registrato dal Companion le firma Pixy. notifyApi.ts: invoke
│   │                        "notify_with_image" (src-tauri/src/notify.rs, toast con immagine su Windows)
│   ├─ report/               periods.ts: periodi (settimana/mese/anno) e barre per i grafici di report
│   └─ hooks/                hook generici (useLatestRef, useNow)
├─ features/                 schermate dell'app (dashboard + intestazione, sidebar,
│                            settings/SettingsPage.tsx: pagina Impostazioni con le schede in tabs/;
│                            settings/catalog/: le card del catalogo, usate dalla scheda Widget e dalla pagina catalogo)
├─ widgets/                  un widget = una cartella
│   ├─ registry.ts           l'UNICO elenco dei widget
│   ├─ WidgetProviders.tsx   monta i provider richiesti dai widget
│   ├─ study/                widget Studio (vedi sotto)
│   ├─ filetransfer/         widget File Transfer (vedi docs/FILE_TRANSFER.md)
│   ├─ youtube/              widget YouTube (vedi sotto)
│   ├─ notes/                widget Quaderno (vedi sotto)
│   ├─ companion/            widget Companion (vedi sotto)
│   ├─ clock/, date/         Orario e Giorno: solo 1×1 + mini dell'intestazione
│   └─ weather/              Meteo (Open-Meteo, opzionale): 1×1 + mini, provider con cache
├─ social/                   i Gruppi (opzionali, docs/GRUPPI.md)
│   ├─ registry.ts / types.ts  l'UNICO elenco dei moduli social (SocialModule, gemello di WidgetDefinition)
│   ├─ SocialProviders.tsx   monta GroupsProvider e i provider dei moduli
│   ├─ groups/               il nucleo lato UI: gruppi, membri, gruppo scelto, azioni, finestre, stati
│   ├─ presence/             comune ai moduli: hub dei canali di presenza (puro), orologio del server
│   ├─ modules/study/        Studio insieme: invio dei totali, presenza del timer, classifica
│   ├─ modules/pixy/         i Pixy di tutti: aspetto sempre, espressioni e fumetti solo se condivisi
│   ├─ widget/               il widget Gruppi (registrato in widgets/registry.ts) e "Impostazioni della stanza"
│   └─ room/                 la Stanza comune (vista "room"): sale da 8 posti con i Pixy veri
├─ ui/                       componenti riusabili senza logica di dominio
│                            (BackButton, ConfirmButton, NumberField, BorderGlow, ProgressBar per tema)
└─ styles/                   tokens.css (colori/raggi/font, varianti native), tokens-varianti.css
│                            (le altre varianti giorno/notte), base.css, tailwind.css
```

### Il widget Studio (`widgets/study/`)

```
study/
├─ index.ts                  WidgetDefinition (nome, taglie, provider, pagina di dettaglio)
├─ StudyWidget.tsx/.css      widget in dashboard (1x1 anello aperto, 2x2 con elenco materie)
├─ StudyDetail.tsx/.css      pagina a schermo intero: scheda Timer e scheda Report
├─ detail/                   TimerTab, SubjectList, ReportTab (+ css accanto)
├─ components/               TimerRing, ModeToggle, SubjectSettingsPopup, NumberField
├─ timer/                    TimerContext (stato e logica), useTimerView (come si DISEGNA il timer),
│                            alerts.ts (suono di fine fase), autoStop.ts (quando fermarsi da solo:
│                            inattività o app che distrae, puro con orologio iniettato)
├─ data/studyRepository.ts   tutte le query SQL di Studio
└─ lib/                      format.ts, colors.ts, report.ts (funzioni pure)
```

### Il widget YouTube (`widgets/youtube/`)

```
youtube/
├─ index.ts                  WidgetDefinition (taglie 2×1, 1×1, 1×2, 3×2; nessun provider: il video si ferma
│                            lasciando la pagina, la posizione viene salvata)
├─ YoutubeWidget.tsx/.css    widget in dashboard
├─ YoutubeDetail.tsx/.css    pagina con tre schermate: HomeScreen, LibraryScreen, WatchScreen
├─ screens/                  le tre schermate
├─ components/               player, righe/miniature video, cartelle, dialoghi, NotesPanel (appunti a tempo)
├─ hooks/useYoutubeData.ts   cartelle e video tutti in memoria, reload() dopo ogni modifica
├─ data/youtubeRepository.ts tutte le query SQL di YouTube
└─ lib/                      funzioni pure: youtube.ts (URL/id), library.ts, notes.ts, folderOptions.ts,
                             watchTracker.ts (conta i secondi in riproduzione, orologio iniettato),
                             studyLink.ts (cartella ↔ materia con lo stesso nome), launch.ts (widget → video da aprire)
```

Il tempo di visione può essere registrato come studio nella materia che ha lo stesso nome della
cartella del video. **Debito noto**: `screens/WatchScreen.tsx` importa direttamente
`study/data/studyRepository.ts`, violando la regola "un widget non importa un altro widget".
Va spostato in `core/` (o fatto passare dall'activityBus) quando si tocca quella parte.

### Il widget Quaderno (`widgets/notes/`)

```
notes/
├─ index.ts                  WidgetDefinition (taglie 3×1, 1×1, 2×2)
├─ NotesWidget.tsx/.css      widget in dashboard
├─ NotesDetail.tsx/.css      pagina: cartelle a sinistra, elenco note, editor
├─ components/               FolderPanel, FolderTree, NoteCollection, NoteEditor,
│                            PageSurface (pagina di carta: contentEditable NON controllato da React),
│                            InkLayer (canvas per penna/evidenziatore/gomma)
├─ data/notesRepository.ts   tutte le query SQL (note_folders, notes, note_pages)
└─ lib/                      drag.ts, editorDom.ts, folders.ts, html.ts (sanitizeHtml)
```

### Il widget Companion (`widgets/companion/`)

```
companion/
├─ index.ts                  WidgetDefinition (taglie 1×1, 2×1, 2×2; provider; pagina)
├─ CompanionContext.tsx      UN cervello + UN animatore per tutta l'app; polling dei segnali
│                            di sistema; tutti i canvas leggono lo stesso fotogramma
├─ CompanionWidget.tsx/.css  widget in dashboard
├─ CompanionDetail.tsx/.css  pagina: anteprima, personalità, animazioni on/off, impostazioni
├─ components/CompanionFace  il Companion con il canvas comune (core/pixy/PixyFace.tsx) + fumetto
├─ engine/                   logica PURA, testabile senza browser
│   ├─ brain.ts              decide umore, sguardo, reazioni, fumetti (orologio e random iniettati)
│   ├─ animations.ts         catalogo delle animazioni accendibili/spegnibili
│   └─ subjectKind.ts        nome della materia → tipo (matematica, scienze, lingue…)
├─ notify/                   notifiche firmate da Pixy: pixyNotifications.ts (espressione, emoji, frase per tipo,
│                            puro), renderNotificationFace.ts (faccia nello stile del tema → PNG)
└─ (segnali di sistema e categorie delle app: core/system/, condivisi con lo Studio)

(motore e disegno di Pixy stanno in core/pixy/, così li usano anche i Gruppi per i Pixy dei compagni:)
core/pixy/
├─ PixyFace.tsx/.css         canvas + ciclo di disegno (~30 fps) + fumetto, per qualunque sorgente di fotogrammi
├─ engine/                   logica PURA: face.ts (parametri ed emozioni), animator.ts (interpola, battiti di ciglia,
│                            sguardo, respiro), personalities.ts (frasi, ritmo, ritocchi), poses.ts (pose e varianti),
│                            snapshot.ts (BrainSnapshot: lo stato del cervello che serve per animare)
└─ render/                   stili grafici: ledRenderer.ts (matrice LED), solidRenderer.ts, styles.ts (registro);
                             costumes.ts (forme dei costumi: fiamma, coperta, libro…) e sdf.ts (distanze)
```

Dati che Pixy legge dall'activityBus oltre a studio e video: `studySubjectName` (Studio), `weatherTemperature`
(Meteo, solo se il widget scarica il dato), `videoPaused`/`videoProgress`/`videoDurationSeconds` (player YouTube).

Flusso: eventi/stato (activityBus, sistema, mouse) → `brain` (poche volte al minuto) →
`animator` (ogni fotogramma) → `render/<stile>` (disegna i parametri).
Per un nuovo stile grafico basta un renderer che disegni gli stessi parametri.

## Regole di dipendenza (non violarle)

```
app  →  features, widgets, social, core
features  →  core, widgets/registry, ui
widgets/<nome>  →  core, ui          (mai features, mai un altro widget)
widgets/registry  →  social          (solo per registrare il widget Gruppi)
social  →  core, ui                  (mai un widget: li legge dall'activityBus e dal DB in sola lettura)
core  →  ui (solo WidgetFrame→BorderGlow) e widgets/registry (solo per il layout di default)
ui  →  niente
```

Un widget non importa mai un altro widget: se due widget condividono qualcosa, quel qualcosa
sale in `core/` o `ui/`.

## Ricette

### Aggiungere un widget
1. Crea `src/widgets/<nome>/` con il componente (riceve `{ w, h }` = taglia in celle) e un `index.ts`
   che esporta una `WidgetDefinition` (id, name, description, component, sizes, …).
2. Aggiungilo in `src/widgets/registry.ts`.
   Catalogo (Impostazioni > Widget e pagina catalogo), dashboard, layout di default e provider si aggiornano da soli.
3. Opzionali: `detailComponent` (pagina aperta cliccando il widget), `provider` (contesto sempre attivo),
   `settingsGroup` (gruppo di impostazioni aperto dalla rotellina della sua card nel catalogo), `defaultPlacement`.

, non si cambia più) in `group_features`: per i gruppi esistenti con un
   `insert … on conflict do nothing`, per quelli nuovi con un trigger `after insert on public.groups` (funzione
   `SECURITY DEFINER`, `SET search_path = ''`, nomi completi, `revoke` a tutti). I canali
   `group:<id>:<feature_key>` sono già autorizzati dall'unica regola su `realtime.messages`: non serve altro.
   Tabelle nuove: RLS attiva (la controlla da sola `01_accesso.sql`), `revoke` dei default, lettura solo a chi condivide
   un gruppo (`private.shares_group_with` / `private.is_group_member`), scritture vincolate o via RPC.
2. **Test**: un file `supabase/tests/database/NN_<nome>.sql` (aiuti in `_aiuti.psql`), poi `npx supabase db reset` e
   `npx supabase test db`.
3. **App**: `src/social/modules/<nome>/` con `feature.ts` (la chiave), un `index.ts` che esporta un `SocialModule` e,
   se serve, il suo `provider` (montato sempre, lavora solo con l'account `ready`). Aggiungilo in `social/registry.ts`.
4. **Rete solo da `core/cloud/`**: i canali con `joinPresenceChannel` (`core/cloud/presence.ts`) tramite il hub comune
   `social/presence/presenceHub.ts` (gli passi un `PresenceCodec`: cosa mandi e come validi ciò che arriva); le query
   in un file `core/cloud/<nome>Api.ts`. Mai `@supabase/supabase-js` fuori da `core/cloud/`.
5. **Payload**: con la versione `v` (chi riceve ignora le versioni che non conosce), istanti in ora del server,
   validazione campo per campo (tipi, elenchi chiusi, lunghezze, intervalli), campi in più tolti, testo degli altri
   sempre come testo (mai `dangerouslySetInnerHTML`). Parti pure con orologio iniettato + uno script
   `scripts/gruppi/<nome>.test.mts`.
6. **Privacy**: ciò che esce è spento di default se dice qualcosa di ciò che fai, con un'impostazione nel gruppo
   `groups` di `core/settings/schema.ts` (e nella pagina "Impostazioni della stanza"); aggiorna l'informativa della
   scheda Account e `docs/GRUPPI.md`.
7. **UI**: dentro `social/` (widget Gruppi, Stanza comune o una vista nuova), con i token del tema in entrambi i file.
   Un dominio nuovo (non Supabase) va anche nella CSP di `src-tauri/tauri.conf.json` (`csp` e `devCsp`).
8. Ricorda all'autore `npx supabase db push` per portare la migrazione sul progetto.

### Aggiungere un'impostazione
1. `core/settings/schema.ts`: chiave con valore di default in `DEFAULT_SETTINGS`.
2. Stesso file: una voce in `SETTING_DEFS` (gruppo, sezione, etichetta, tipo). Il controllo compare da solo.
3. Leggila con `useSettings()`. Nessuna migrazione: sono righe chiave/valore e le chiavi mancanti usano il default.
   Valori non validi nel DB vengono sostituiti dal default (`sanitizeSettings`).

Le impostazioni sono una pagina (`openSettings(sezione)` di `NavContext`): Aspetto, Dashboard, Widget, Generale e Account (accesso ai Gruppi, vedi `docs/GRUPPI.md`).
La scheda Widget è il catalogo: le impostazioni di un widget si aprono dentro la sua card (rotellina);
`openSettings("widget:<id>")` apre la scheda con quella card già aperta.

### Aggiungere un mini (spazi in alto a destra della dashboard)
1. Nel widget: `mini/<Nome>Mini.tsx` + `<Nome>Mini.css` accanto, stessa forma degli altri mini (elemento visivo a
   sinistra, due righe di testo: 13px testo primario + 12px secondario; numeri con `--font-display`).
2. Nella sua `WidgetDefinition`: `mini: <Nome>Mini`. Compare da solo tra le scelte di Impostazioni > Dashboard.
3. Deve funzionare nei 4 temi e stare in ~56px di altezza. Doppio click sullo spazio = dettaglio (se c'è).
Gli spazi sono `headerSlot1`/`headerSlot2` nello schema (`"auto"` = come il mockup del tema, `HEADER_SLOT_AUTO`
nello stesso file). I due spazi non possono mostrare lo stesso mini, e non vanno mai a capo: un mini si
restringe (`min-width: 0`, testi con l'ellissi) invece di allargarsi.

### Far reagire il Companion a qualcosa di nuovo
1. Nel widget che "sa" la cosa: `publishActivity({...})` (stato) o `emitActivityEvent({...})` (momento),
   da `core/activity/activityBus.ts` (aggiungi il tipo lì).
2. In `widgets/companion/engine/brain.ts`: gestiscilo in `handleEvent` o `decideBehavior`.
3. Se serve una frase: una chiave in `personalities.ts` per ogni personalità.

### Mandare una notifica di sistema
1. Un nuovo `kind` in `AppNotificationKind` (`core/notify/notifier.ts`), poi `sendAppNotification({ kind, title, body })`
   dal widget (rispettando le sue impostazioni di notifica). Mai `sendNotification` del plugin direttamente.
2. In `widgets/companion/notify/pixyNotifications.ts`: espressione, emoji e chiave della frase per quel `kind`;
   se la frase è nuova, una chiave in `personalities.ts` per ogni personalità.

### Cambiare lo schema del DB
Aggiungi un elemento **in fondo** a `core/db/migrations.ts` (`version` = ultima + 1).
Non modificare mai una migrazione già rilasciata. Gli statement devono poter essere rieseguiti
(`IF NOT EXISTS`, `INSERT OR IGNORE`; un `ALTER TABLE ADD COLUMN` già applicato viene ignorato dal runner).

### Cambiare il design
- Colori, raggi, font, spaziature: `styles/tokens.css` (e le impostazioni Aspetto/Effetti, che li sovrascrivono su `<html>`).
- Usa sempre i token (`--bg-card`, `--surface-1/2/3`, `--accent`, `--on-accent`, `--text-*`): così il tema chiaro funziona da solo.
- Ogni componente ha il suo `.css` accanto; niente CSS globale fuori da `styles/`.
- Come appare il timer (colori, testo, anello): `widgets/study/timer/useTimerView.ts`, usato da widget e pagina.
- I temi sono 4 (Notte, Opaco, Quaderno, Fosforo), ognuno in due varianti, giorno e notte, che cambiano **solo i
  colori** (forme, font e componenti restano quelli del tema). Su `<html>` ci sono `data-theme` e `data-mode`
  (`giorno|notte`, già risolta). La variante nativa (Notte e Fosforo: notte; Opaco e Quaderno: giorno) è il blocco
  `:root[data-theme="<id>"]` di `tokens.css`; l'altra è un blocco completo `:root[data-theme][data-mode]` in
  `tokens-varianti.css` (con pigmenti di Opaco notte, post-it di Quaderno notte e anteprime della scheda Aspetto).
  Un token nuovo va aggiunto in entrambi i file. I mockup in `docs/design/temi/` sono la fonte di verità.
- L'impostazione `themeMode` è `giorno|notte|auto`: `auto` segue il sistema (`useSystemDark`) anche ad app aperta.
  `useTheme()` restituisce il tema risolto (`mode`, `scheme`, `glow`, `defaultAccent`, `accent`): il codice non
  guarda mai `themeMode` direttamente. L'accent personalizzato è uno per variante (`ACCENT_KEYS` in `schema.ts`).
  Lo script in `index.html` applica tema e variante dalla cache (`pd-theme`, `pd-mode`, `pd-theme-mode`) prima del
  bundle, ricalcolando `auto` dal sistema; la splash ha i colori di tutte le 8 combinazioni.
- I canvas che leggono i token (faccia del Companion, inchiostro delle Note) li rileggono quando cambiano
  `theme.id`/`theme.mode`. Nelle Note il colore `THEME_INK` (`#f2f2f4`) si disegna con `--text-primary`.
- Quando un pezzo cambia **forma** per tema (non solo colore) si usa `useThemeVariant(map)` di
  `core/theme/variants.ts` con una `ThemeVariants<T>` (una voce per tema), mai `if (theme === …)`.
  Se la variante è un componente, si rende con `createElement(Variant, props)` (regola lint `static-components`).
- Le card per tema dei widget stanno in `card/cards.ts` (es. `STUDY_CARDS`, `COMPANION_CARDS`): la pagina di
  dettaglio riusa la card M del tema, così è identica alla dashboard.
- In Opaco ogni widget ha un pigmento (`data-pigment`, mappa in `themes.ts`) che ridefinisce i token nel suo riquadro
  e nella sua pagina di dettaglio (`.detail-scope`). In Quaderno `.card-postit` dà l'aspetto del post-it.
- Token di forma utili: `--card-*`, `--panel-*`, `--radius-item` (pillola in Opaco/Fosforo, non usarlo per
  righe alte), `--btn-ghost-*`/`--btn-primary-*`, `--row-active-*`, `--display-texture`/`--display-border`,
  `--thumb-*` (miniature video), `--main-bg` (in Quaderno è il foglio a quadretti).

### Aggiungere una proprietà a una materia
Colonna in una nuova migrazione → campo in `Subject`/`SubjectRow`/`PATCH_COLUMNS` (`study/data/studyRepository.ts`)
→ controllo in `components/SubjectSettingsPopup.tsx`.

## Convenzioni

- Contesti React: `XContext.tsx` esporta **solo** il `XProvider`; tipo del valore, `createContext` e hook stanno in
  `useX.ts` accanto (es. `core/settings/useSettings.ts`). Così l'aggiornamento a caldo di Vite non crea un secondo
  contesto (errore "useX deve essere usato dentro <XProvider>") e il lint `only-export-components` resta pulito.
- Stato "ultimo valore" dentro callback di lunga durata (interval, listener): `useLatestRef`.
- Le query SQL stanno solo nei `*Repository.ts`; i componenti non scrivono SQL.
- Rete: solo il Meteo va in internet, solo se attivato (città impostata e widget o mini in uso), e solo da
  `widgets/weather/data/weatherApi.ts` (come `invoke()` in `data/*Api.ts`). Cache nel `meta` (`weather_cache`).
- Impostazioni = preferenze dell'app (schema). Dati e metadati interni = tabelle/`meta`.
- Il dettaglio di un widget si apre con il **doppio click** sulla cella (Dashboard.tsx). Il doppio click su un controllo interno (button, link, input) viene ignorato; un pulsante che occupa tutta la cella (1×1) va marcato `data-cell-action` perché il doppio click apra comunque il dettaglio. I controlli continuano a fare `e.stopPropagation()` sul click.
