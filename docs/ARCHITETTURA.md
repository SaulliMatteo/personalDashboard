# Architettura

## Mappa delle cartelle

```
src/
├─ main.tsx                  entry point: importa gli stili e monta <App/>
├─ app/                      guscio dell'applicazione
│   ├─ App.tsx               albero dei provider + vista corrente
│   ├─ DatabaseGate.tsx      non monta nulla finché le migrazioni DB non sono finite
│   └─ AppShell.tsx / shell.css   sidebar + area contenuto (.main è l'UNICO che scrolla)
├─ core/                     infrastruttura, NON conosce nessun widget specifico
│   ├─ db/                   client SQLite, migrazioni versionate, store chiave/valore "meta"
│   ├─ settings/             schema.ts = UNICA fonte di verità delle impostazioni
│   ├─ layout/               griglia: contesto, repository, compactor (spinta ritardata)
│   ├─ nav/                  vista corrente (dashboard / catalogo / dettaglio widget)
│   ├─ widgets/              tipi (WidgetDefinition), taglie, WidgetFrame (cornice comune)
│   ├─ activity/             bacheca delle attività: i widget pubblicano (studio, video, file)
│   │                        e chi vuole ascolta, senza importarsi a vicenda
│   └─ hooks/                hook generici (useLatestRef)
├─ features/                 schermate dell'app (dashboard, catalogo, impostazioni, sidebar)
├─ widgets/                  un widget = una cartella
│   ├─ registry.ts           l'UNICO elenco dei widget
│   ├─ WidgetProviders.tsx   monta i provider richiesti dai widget
│   ├─ weather/ tasks/ calendar/ notes/
│   ├─ study/                widget Studio (vedi sotto)
│   └─ companion/            widget Companion (vedi sotto)
├─ ui/                       componenti riusabili senza logica di dominio
│                            (BackButton, ConfirmButton, NumberField, BorderGlow)
└─ styles/                   tokens.css (colori/raggi/font), base.css, tailwind.css
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
│                            alerts.ts (suono + notifica di sistema)
├─ data/studyRepository.ts   tutte le query SQL di Studio
└─ lib/                      format.ts, colors.ts, report.ts (funzioni pure)
```

### Il widget Companion (`widgets/companion/`)

```
companion/
├─ index.ts                  WidgetDefinition (taglie 1×1, 2×1, 2×2; provider; pagina)
├─ CompanionContext.tsx      UN cervello + UN animatore per tutta l'app; polling dei segnali
│                            di sistema; tutti i canvas leggono lo stesso fotogramma
├─ CompanionWidget.tsx/.css  widget in dashboard
├─ CompanionDetail.tsx/.css  pagina: anteprima, personalità, animazioni on/off, impostazioni
├─ components/CompanionFace  canvas + ciclo di disegno (~30 fps) + fumetto
├─ engine/                   logica PURA, testabile senza browser
│   ├─ face.ts               parametri della faccia ed emozioni (preset numerici)
│   ├─ brain.ts              decide umore, sguardo, reazioni, fumetti (orologio e random iniettati)
│   ├─ animator.ts           interpola, battiti di ciglia, sguardo, respiro, saltelli
│   ├─ animations.ts         catalogo delle animazioni accendibili/spegnibili
│   ├─ personalities.ts      personalità e frasi
│   └─ appCategory.ts        app in primo piano → categoria (musica, codice, video…)
├─ render/                   stili grafici: ledRenderer.ts (matrice LED), styles.ts (registro)
└─ data/systemApi.ts         invoke("companion_snapshot") → src-tauri/src/companion.rs (Windows)
```

Flusso: eventi/stato (activityBus, sistema, mouse) → `brain` (poche volte al minuto) →
`animator` (ogni fotogramma) → `render/<stile>` (disegna i parametri).
Per un nuovo stile grafico basta un renderer che disegni gli stessi parametri.

## Regole di dipendenza (non violarle)

```
app  →  features, widgets, core
features  →  core, widgets/registry, ui
widgets/<nome>  →  core, ui          (mai features, mai un altro widget)
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
   Catalogo, dashboard, layout di default, provider e scheda Impostazioni > Widget si aggiornano da soli.
3. Opzionali: `detailComponent` (pagina aperta cliccando il widget), `provider` (contesto sempre attivo),
   `settingsGroup` (gruppo di impostazioni mostrato in Impostazioni > Widget), `defaultPlacement`.

### Aggiungere un'impostazione
1. `core/settings/schema.ts`: chiave con valore di default in `DEFAULT_SETTINGS`.
2. Stesso file: una voce in `SETTING_DEFS` (gruppo, sezione, etichetta, tipo). Il controllo compare da solo.
3. Leggila con `useSettings()`. Nessuna migrazione: sono righe chiave/valore e le chiavi mancanti usano il default.
   Valori non validi nel DB vengono sostituiti dal default (`sanitizeSettings`).

### Far reagire il Companion a qualcosa di nuovo
1. Nel widget che "sa" la cosa: `publishActivity({...})` (stato) o `emitActivityEvent({...})` (momento),
   da `core/activity/activityBus.ts` (aggiungi il tipo lì).
2. In `widgets/companion/engine/brain.ts`: gestiscilo in `handleEvent` o `decideBehavior`.
3. Se serve una frase: una chiave in `personalities.ts` per ogni personalità.

### Cambiare lo schema del DB
Aggiungi un elemento **in fondo** a `core/db/migrations.ts` (`version` = ultima + 1).
Non modificare mai una migrazione già rilasciata. Gli statement devono poter essere rieseguiti
(`IF NOT EXISTS`, `INSERT OR IGNORE`; un `ALTER TABLE ADD COLUMN` già applicato viene ignorato dal runner).

### Cambiare il design
- Colori, raggi, font, spaziature: `styles/tokens.css` (e le impostazioni Aspetto/Effetti, che li sovrascrivono su `<html>`).
- Usa sempre i token (`--bg-card`, `--surface-1/2/3`, `--accent`, `--on-accent`, `--text-*`): così il tema chiaro funziona da solo.
- Ogni componente ha il suo `.css` accanto; niente CSS globale fuori da `styles/`.
- Come appare il timer (colori, testo, anello): `widgets/study/timer/useTimerView.ts`, usato da widget e pagina.

### Aggiungere una proprietà a una materia
Colonna in una nuova migrazione → campo in `Subject`/`SubjectRow`/`PATCH_COLUMNS` (`study/data/studyRepository.ts`)
→ controllo in `components/SubjectSettingsPopup.tsx`.

## Convenzioni
- Stato "ultimo valore" dentro callback di lunga durata (interval, listener): `useLatestRef`.
- Le query SQL stanno solo nei `*Repository.ts`; i componenti non scrivono SQL.
- Impostazioni = preferenze dell'app (schema). Dati e metadati interni = tabelle/`meta`.
- Un click su un controllo dentro un widget deve fare `e.stopPropagation()` (il click sul widget apre il dettaglio).
