# Redesign: sistema di temi + griglia 6×4 che riempie la finestra

## Contesto

Repo: `personalDashboard` (Tauri 2 + React 19 + Vite + Tailwind 4, `react-grid-layout`, SQLite via `@tauri-apps/plugin-sql`). L'app è local-first: niente risorse caricate da internet a runtime.

Obiettivo: sostituire il tema scuro/chiaro attuale con **quattro temi completi** (Notte, Opaco, Quaderno, Fosforo). Ogni tema cambia colori, font e forme, e anche alcuni componenti interni dei widget. In più la dashboard passa a una **griglia 6×4 che riempie la finestra senza scorrere**, con un catalogo di taglie più vario.

Il design è già stato approvato su mockup. **L'obiettivo è che l'app risulti visivamente identica ai mockup**, non "ispirata". Se manca qualcosa (per esempio come appare un widget in una taglia non disegnata, o una pagina di dettaglio), **chiedimi prima di decidere**. Regola del progetto: se non sei sicuro chiedi sempre conferme e chiarimenti, non cercare di indovinare a caso.

## Riferimenti visivi: la fonte di verità

In `temi-dashboard/docs/design/temi/` ci sono i mockup approvati, come pagine HTML statiche e autonome (font da Google Fonts, stili inline, nessun JavaScript):

| File | Cosa mostra | Finestra |
|---|---|---|
| `notte.html` | Dashboard completa, tema Notte | 1440×900 |
| `opaco.html` | Dashboard completa, tema Opaco | 1440×900 |
| `quaderno.html` | Dashboard completa, tema Quaderno | 1440×900 |
| `fosforo.html` | Dashboard completa, tema Fosforo | 1440×900 |
| `widget-1x1.html` | Le 5 taglie 1×1 nei 4 temi (una riga per tema) | 1240 di larghezza |
| `impostazioni-aspetto.html` | Scheda Aspetto con la scelta del tema | 1240×700 |

Regole per usarli:

1. **Prima di scrivere il codice di un widget o di un pezzo del guscio, apri il mockup corrispondente e leggi i valori esatti**: colori, dimensioni dei font, pesi, interlinee, padding, gap, raggi, bordi, ombre, dimensioni di icone e pulsanti. Riproducili uguali.
2. **Se questo documento e un mockup non concordano, vale il mockup.** Segnalami la differenza.
3. I mockup usano stili inline per comodità. **Non copiarli inline nei componenti**: trasformali in CSS accanto al componente (come fa già il progetto) e sostituisci ogni colore con il token del tema.
4. I dati nei mockup sono di esempio ("Analisi 2", "18:42", "3 file"…). Nell'app vanno collegati ai dati reali; i testi fissi dell'interfaccia (etichette, "Aggiungi widget", "Prossimi", "Ultimi 7 giorni"…) invece vanno riprodotti uguali.
5. **Verifica visiva a ogni fase**: apri il mockup e l'app affiancati alla stessa dimensione di finestra (1440×900) e confronta widget per widget. Se puoi usare Playwright o un browser headless, cattura una schermata di entrambi e confrontale; se non puoi, dimmi esattamente cosa devo confrontare io con `npm run tauri dev`.
6. In `notte.html`, `opaco.html`, `quaderno.html` e `fosforo.html` il File transfer appare in una versione 1×1 più ricca (titolo e pulsante). **Per la taglia 1×1 vale `widget-1x1.html`**, che è la versione ultra minimal approvata dopo.

Mappa mockup → componenti dell'app:

| Nel mockup | Nell'app |
|---|---|
| Colonna di sinistra | `src/features/sidebar/Sidebar.tsx` |
| Saluto, data, timeline (Notte), ora (Fosforo) | `src/features/dashboard/DashboardHeader.tsx` |
| Card "Studio" grande (3×3) | `StudyWidget` in taglia `XL` |
| Card "Pixel" (2×2) | `CompanionWidget` in taglia `M`, faccia in `companion/render/*` |
| Card "File" in alto a destra | `FileTransferWidget` (in 1×1 vale `widget-1x1.html`) |
| Riquadro tratteggiato "Aggiungi widget" | **Nuovo**: slot vuoto che apre il catalogo dei widget. Mostralo nella prima cella libera della griglia, solo se c'è almeno una cella libera. |
| Card "YouTube" (3×2) | `YoutubeWidget` in taglia `L` |
| Card "Note" (3×1) | `NotesWidget` in taglia `STRIP` |
| Finestra "Impostazioni" | `src/features/settings/SettingsModal.tsx`, nuova scheda Aspetto |

## Come lavorare

- Crea un branch `feat/temi`.
- Lavora **una fase alla volta**. Alla fine di ogni fase: `npm run build` e `npm run lint` devono passare, poi fermati, riassumimi cosa hai cambiato e aspetta il mio ok prima della fase successiva. Un commit per fase.
- **Fase 0 obbligatoria:** leggi il codice citato qui sotto e scrivimi un piano breve (file toccati, nuovi file, rischi). Non scrivere codice finché non approvo il piano.
- Non introdurre librerie UI. Per i font usa i pacchetti `@fontsource` (vedi Fase 1).
- Non mettere colori esadecimali nei componenti: solo token CSS (eccezione: i colori delle materie scelti dall'utente).

## Decisioni prese (20 ottobre 2026)

- I mockup restano in `temi-dashboard/docs/design/temi/`: tutti i riferimenti puntano lì.
- **Tutti i widget aprono la pagina di dettaglio con il doppio click**, in ogni taglia. Il click singolo esegue
  l'azione della cella (1×1 Studio: play/pausa; 1×1 YouTube: riprendi il video) oppure non fa nulla.
- Companion 2×2: **niente barra "Energia"** (il dato non esiste); il footer mostra nome e stato.
- Pagine di dettaglio: stessa struttura e funzioni di oggi, ma nel **linguaggio completo del tema** (quadrante,
  barre, numeri grandi, pannelli, font; in Opaco il pigmento del widget).

## Stato attuale (da leggere prima di iniziare)

- `src/styles/tokens.css`: token di colore su `:root`, con override `[data-theme="light"]`.
- `src/core/settings/schema.ts`: unica fonte delle impostazioni (`theme: dark|light|system`, `accentColor`, `cardRadius`, glow, griglia…). I gruppi `appearance`, `glow` e `dashboard` **non hanno più una scheda** nel modale Impostazioni.
- `src/core/settings/applySettings.ts`: scrive `data-theme` e le variabili CSS su `<html>`.
- `src/core/settings/theme.ts`: risolve `system`.
- `src/core/widgets/WidgetFrame.tsx`: passa a `BorderGlow` uno sfondo **fisso** `#ffffff`/`#000000`. Va corretto.
- `src/ui/BorderGlow.*`: bordo luminoso che segue il mouse.
- `src/core/layout/gridConfig.ts` (`GRID_COLS = 4`), `src/features/dashboard/Dashboard.tsx` (`rowHeight = colWidth * gridRowHeightRatio`), `src/core/layout/compactor.ts`, `src/core/layout/layoutRepository.ts`, `src/core/db/migrations.ts`. La migrazione v1 ha già azzerato i layout in un cambio di colonne precedente.
- `src/core/widgets/sizes.ts` e `types.ts`; ogni widget dichiara `sizes` in `src/widgets/<nome>/index.ts`.
- Colori scritti a mano: `YoutubeDetail.css` (circa 33), `BorderGlow.css`, `NotesDetail.css`, `FileTransferDetail.css`, `widgetCatalog.css`, `companion/render/*`, `study/lib/colors.ts`, `notes/lib/*`. Cerca con `grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src`.

## Fase 1: fondamenta dei temi

1. **Impostazione tema.** In `schema.ts` sostituisci `theme` con:
   - `theme: "notte" | "opaco" | "quaderno" | "fosforo"`, con default `"notte"`. **Niente opzione "Segui il sistema"**: i quattro temi sono scelte indipendenti e l'app non cambia mai tema da sola in base al sistema operativo. Elimina `useSystemPrefersLight`/`resolveTheme` in `theme.ts` se non servono più.
   - Converti i valori salvati: `dark` → `notte`, `light` → `quaderno`, `system` → `notte`. `sanitizeSettings` scarta i valori non validi, quindi aggiungi una conversione esplicita prima della validazione, così l'utente non perde la scelta.
   - `accentOverride: boolean` (default `false`). Se è `false` si usa l'accent del tema; se è `true` si usa `accentColor`.
2. **Definizione dei temi.** Crea `src/core/theme/themes.ts`, un oggetto per tema con `id`, `label`, `description`, `scheme: "dark" | "light"` (per `color-scheme`), `defaultAccent`, `glow: boolean` (solo Notte `true`) e `fonts`.
3. **Token.** Riscrivi `tokens.css` con un blocco `:root[data-theme="<id>"]` per tema. Tieni i nomi di token esistenti dove hanno senso (`--bg`, `--bg-card`, `--text-*`, `--accent`, `--surface-*`, `--radius-*`…) e aggiungi quelli nuovi elencati sotto. Tutti i componenti devono leggere solo token.
4. **Font locali.** Installa i pacchetti `@fontsource` di Manrope, Bricolage Grotesque, Figtree, Caveat, JetBrains Mono e Doto (variable dove esiste). Se Doto non esiste su fontsource, scarica il woff2 ufficiale da Google Fonts in `src/assets/fonts/` con il suo file di licenza OFL e dichiaralo con `@font-face`. **Chiedimi prima di scaricare file.** Il font di ogni tema si applica tramite `--font-family` e `--font-display`.
5. **Pulizia dei colori scritti a mano.** Sostituiscili con token in tutti i file elencati sopra. `WidgetFrame` legge lo sfondo dal tema e disattiva il glow quando `theme.glow` è `false`.
6. La pagina impostazioni non va toccata in questa fase. Per provare i temi basta cambiare il default.

## Fase 2: griglia 6×4 che riempie la finestra

1. `GRID_COLS = 6`. Le righe restano `settings.gridRows` (default 4).
2. L'altezza di riga si calcola dall'altezza disponibile del contenitore: `rowHeight = (altezzaContenitore - margini) / righe`, misurata con `ResizeObserver`. Se il risultato scende sotto `MIN_ROW_HEIGHT = 120`, usa 120 e lascia scorrere `.main`: meglio scorrere che schiacciare. Elimina `gridRowHeightRatio` da schema e codice.
3. Nuovo catalogo in `sizes.ts`: `S` 1×1, `W` 2×1, `T` 1×2, `M` 2×2, `STRIP` 3×1, `L` 3×2, `XL` 3×3. Etichette italiane, per esempio "Piccola (1×1)".
4. Taglie per widget. La prima elencata è il default:
   - Studio: `M`, `S`, `L`, `XL`
   - Companion: `S`, `W`, `M`
   - File transfer: `S`, `W`, `M`
   - YouTube: `W`, `S`, `T`, `L`
   - Note: `STRIP`, `S`, `M`
5. Layout di default (`defaultPlacement`, coordinate x,y in colonne/righe): Studio `M` in (0,0); Companion `S` in (2,0); File `S` in (2,1); YouTube `W` in (3,0); Note `STRIP` in (3,1). Se non sta, proponimi un'alternativa.
6. Nuova migrazione che esegue `DELETE FROM dashboard_layout`: i layout a 4 colonne non sono convertibili in modo sensato. Commenta il motivo come nella v1.
7. Verifica che `compactor.ts`, `clampToBounds` e `finalizeLayout` funzionino con 6 colonne.

## Fase 3: contenuto dei widget per taglia

Ogni widget riceve `w` e `h` e mostra di più man mano che cresce. Il contenuto deve stare nella cella senza scrollbar interne: se non ci sta, si toglie un elemento, non si rimpicciolisce il testo sotto 12px.

### Taglia 1×1 (`S`): ultra minimal

Ogni widget ha una 1×1 che mostra **una sola informazione**, centrata e grande. Niente titolo del widget, niente pulsanti visibili, al massimo un'etichetta di una parola in basso e un indicatore di stato in alto a destra. Valori per tema:

| Widget | Contenuto | Notte | Opaco | Quaderno | Fosforo |
|---|---|---|---|---|---|
| Studio | Solo il tempo | Manrope 200, circa 46px, più una linea di avanzamento da 2px in fondo (margini 22px, traccia `#1E2538`, accent) | Bricolage 800, circa 52px, sul pigmento salvia, nient'altro | Caveat 600, circa 60px, in inchiostro, con sotto una linea "a penna" (traccia tratteggiata, progresso in inchiostro) | Doto 900, circa 46px, sul "display" a puntini, più il LED rosso in alto a destra solo mentre il timer corre |
| Companion | Solo gli occhi | Occhi pieni `#DCE3FF` | Occhi in inchiostro sul blu polvere | Occhi in inchiostro su un post-it ruotato | Occhi a matrice di punti sul display |
| File | Numero di file ricevuti | Numero, etichetta "file", punto di stato (verde se online) | Numero grande (Bricolage 800) sul senape, punto di stato in inchiostro, nessuna etichetta | Numero in Caveat, etichetta "file", punto verde se online | Numero in Doto, etichetta "file", LED rosso se online |
| YouTube | Solo "riprendi il video" | Miniatura a tutta cella, play al centro, avanzamento da 3px in fondo | Cella malva con il play in un cerchio di inchiostro | Cornice a penna con il play in inchiostro | Display a puntini con il play in un cerchio contornato |
| Note | Numero di note | Numero, etichetta "note" | Numero grande sul fondo carta, nessuna etichetta | Numero in Caveat, etichetta "note" | Numero in Doto, etichetta "note" |

Interazione in 1×1: per Studio e YouTube l'intera cella è un pulsante (Studio: play/pausa; YouTube: riprendi il video), con un `aria-label` che legge il contenuto (per esempio "Studio, 18:42, metti in pausa"). Così il click non può più aprire la pagina di dettaglio: **chiedimi** come preferisco aprirla in questa taglia prima di implementarlo. Per gli altri widget il click apre il dettaglio come oggi.

### Taglie più grandi

Disegnate nei mockup: Studio `XL`, Companion `M`, YouTube `L`, Note `STRIP` e tutte le `S`. **Le altre taglie non sono disegnate**: ricavale dalle versioni disegnate dello stesso tema, togliendo elementi e senza introdurre stili nuovi, secondo le regole qui sotto. Finita la Fase 3, **mostrami una schermata di ogni taglia non disegnata in tutti e 4 i temi** prima di procedere.

Regole per ricavarle:
- **Studio `M` (2×2):** solo la colonna sinistra della versione `XL`, cioè quadrante, tempo, fase, materia attiva e i due pulsanti, centrati. Il quadrante si ridimensiona per stare nella cella.
- **Studio `L` (3×2):** la parte centrale della `XL` (quadrante a sinistra, materie a destra), senza la riga dei cicli e senza il grafico dei 7 giorni.
- **Companion `W` (2×1):** la faccia a sinistra nel suo riquadro, nome e stato a destra.
- **File `W` (2×1):** a sinistra numero ed etichetta; a destra indirizzo e pulsante avvia/ferma; stato in alto a destra. Stessi stili della card File dei mockup.
- **File `M` (2×2):** come `W`, più gli ultimi 3 file in elenco (righe separate da linee, come l'elenco delle materie).
- **YouTube `W` (2×1):** la colonna sinistra della `L` (miniatura 16:9 e titolo), disposta in orizzontale: miniatura a sinistra, titolo e posizione a destra.
- **YouTube `T` (1×2):** miniatura 16:9 in alto, sotto il titolo e la posizione.
- **Note `M` (2×2):** intestazione come la `STRIP`, poi un elenco di 4 note (titolo a sinistra, quando a destra, righe separate da linee).

Contenuti per taglia:

- **Studio.** `M`: quadrante del timer, tempo, fase, materia attiva, controlli. `L`: come M più l'elenco delle materie di oggi (nome, tempo, barra di avanzamento per materia) e il totale di oggi. `XL`: come L più i cicli del pomodoro ("Ciclo 3 di 4", con indicatori), "Pausa breve tra N minuti" e un grafico a barre degli ultimi 7 giorni (iniziale del giorno sotto ogni barra, oggi evidenziato). I dati vengono da `studyRepository`. Se una query non c'è, aggiungila lì.
- **Companion.** `W`: faccia e stato. `M`: faccia, fumetto, nome e stato.
- **File transfer.** `W`: stato (Online/Offline), numero di file ricevuti, indirizzo, avvia/ferma. `M`: come W più gli ultimi 3 file.
- **YouTube.** `W`: miniatura a sinistra, titolo e "Continua da 12:40" a destra. `T`: miniatura sopra, titolo sotto. `L`: due colonne. A sinistra la miniatura **sempre 16:9** (mai allungata per riempire l'altezza), con sotto titolo, posizione e avanzamento. A destra l'intestazione "YouTube" con "N in coda" e, in basso, "Prossimi" con i 2 video successivi della libreria e la loro durata.
- **Note.** `STRIP`: tre note recenti affiancate (titolo e quando). `M`: elenco di 4 note.

## Fase 4: varianti per tema dei componenti caratterizzanti

Alcuni elementi sono diversi per tema, non solo nei colori. Implementali come **varianti** selezionate dal tema corrente tramite un piccolo registro (per esempio `src/core/theme/parts.tsx` con `useThemePart("timerDial")`). Niente `if (theme === …)` sparsi nei widget. Le varianti:

| Parte | Notte | Opaco | Quaderno | Fosforo |
|---|---|---|---|---|
| Quadrante timer (sostituisce `TimerRing`) | Ghiera di 60 tacche: ogni 5 è lunga (12px), le altre corte (6px); le tacche "trascorse" in accent; disco interno con il tempo | Nessun anello: tempo enorme (peso 800, interlinea 0.82) più una barra spessa (16px, arrotondata) | Cerchio "tracciato a penna" (path leggermente irregolare), traccia tratteggiata, progresso in inchiostro | 60 puntini in cerchio, accesi quelli trascorsi, l'ultimo acceso è rosso LED e più grande; dentro un "display" con texture a puntini |
| Barra di avanzamento | Sottile (3–4px), arrotondata | Spessa (10–16px), a pillola | Contorno a penna (1.5px) con riempimento | Celle separate (6px di altezza, spazio di 3px), accese o spente |
| Faccia del Companion (`companion/render/styles.ts`, `ledRenderer.ts`) | Occhi pieni arrotondati con un alone tenue | Occhi pieni in inchiostro del blocco colore | Occhi in inchiostro su un post-it ruotato di -1.2° | Occhi a matrice di punti dentro una "lente" circolare con anello sottile |
| Numeri grandi | Manrope 200 | Bricolage 800 | Caveat 600 in inchiostro | Doto 900 |

Mantieni il comportamento esistente del Companion (animazioni, emozioni, personalità): cambia solo come viene disegnato.

## Fase 5: guscio dell'app e Impostazioni

1. **Scheda "Aspetto"** nel modale Impostazioni (oggi c'è solo Widgets):
   - griglia di 4 card tema (con anteprima in miniatura di sfondo e celle, nome, una riga di descrizione). Nessuna opzione "Segui il sistema";
   - "Colore accent" con l'opzione "Usa quello del tema" (cioè `accentOverride: false`) e una palette;
   - interruttore Animazioni;
   - le voci di `appearance` ancora valide. Elimina `cardRadius` e `itemRadius`: ora li decide il tema.
2. **Scheda "Dashboard"** con le voci del gruppo `dashboard` ancora valide (intestazione, saluto, righe, trascinamento, anteprima fantasma).
3. **Intestazione della dashboard per tema:**
   - Notte: saluto, data e ora; a destra la **timeline della giornata** (barra 7:00–24:00, blocchi delle sessioni di studio di oggi, linea verticale sull'ora attuale, orari 8/12/16/20/24 sotto). Nella sidebar, in basso, la card "Obiettivo di oggi" (mostrala solo se `studyDailyGoalMinutes > 0`).
   - Opaco: saluto grande (Bricolage 800) e data a destra.
   - Quaderno: saluto in Caveat più "Hai studiato N ore e M minuti".
   - Fosforo: saluto, data e a destra l'ora corrente in Doto.
4. **Sidebar per tema:** voce attiva Notte a pillola scura con un punto accent; Opaco a pillola piena inchiostro; Quaderno su fondo azzurro chiaro con testo inchiostro; Fosforo a pillola chiara "fosforo" con testo scuro.
5. Pagine di dettaglio, catalogo e modali: devono usare i token e risultare coerenti, ma **non hanno un mockup**. Applica i token. Se una pagina richiede scelte di design non ovvie, fammi vedere 2 opzioni prima di procedere.

## Specifiche dei temi

Riassunto dei valori principali, utile per definire i token. Per tutto il resto (misure, spaziature, dimensioni dei font di ogni elemento) fanno fede i mockup.

### Notte (scuro, blu inchiostro, ricco di dettagli)
- Sfondo `#090C15`; bordo della sidebar `#161D30`.
- Card: sfondo `linear-gradient(180deg, #151B2E, #10152A)`, bordo 1px `#1F2740`, `box-shadow: inset 0 1px 0 rgba(200,215,255,0.07)`, raggio 22px.
- Pannello interno (display, celle delle note): `#0B0F1C`, bordo `#182036`, raggio 16px.
- Riga attiva o hover: `#161C2E`, bordo `#2A3350`. Tracce: `#1E2538`; tacche spente `#232B44` (lunghe `#3A4566`).
- Testo `#E9ECF5`, secondario `#9AA2BA`, attenuato `#8890A8`.
- Accent `#8EA6FF` (testo su accent: `#090C15`; accent chiaro `#B7C6FF`). Successo `#7DD3B0`; pausa `#F0B47A`.
- Font Manrope: 200 per i numeri grandi, 300 per i titoli, 400/500 per il resto. Raggio dei controlli 12px; spazio fra i widget 14px. Glow attivo.

### Opaco (chiaro, blocchi di colore pigmentato)
- Sfondo pietra `#D8D5CD`; inchiostro `#22251F`; secondario `#4D5047`; pulsante neutro `#C9C5BB`; slot vuoto tratteggiato `#9E9A90`.
- Nessun bordo, nessuna ombra, nessun gradiente. Raggio dei widget 28px; pulsanti e chip a pillola.
- Ogni widget ha un **pigmento fisso** (mappa `widgetId → pigmento` nel tema; i widget futuri ciclano sulla lista). Valori: fondo / inchiostro / tono scuro / tono medio.
  - Salvia (Studio): `#A9B59C` / `#1F2B1C` / `#8E9C80` / `#95A387`
  - Blu polvere (Companion): `#9DB0C0` / `#1B2A36`
  - Senape (File): `#D2B26A` / `#3A2C0A` / chiaro `#EFDFB8`
  - Malva (YouTube): `#B8A1B4` / `#33213A` / `#8F7690` / `#9C849A`
  - Carta (Note): `#EFECE5` / `#22251F` / celle `#E2DED5`
- Il testo su un pigmento usa sempre l'inchiostro dello stesso pigmento.
- Font Bricolage Grotesque: 800 per i numeri grandi e i titoli, 500/600 per il resto. Spazio fra i widget 12px. Glow spento.

### Quaderno (chiaro, foglio a quadretti)
- Area principale: `#FCFDFF` con quadretti da 24px, linee `#E4EBF5` (`background-image` con due `linear-gradient`). Linea di margine verticale rossa `#F2A9A9`, 2px, a 42px dal bordo sinistro dell'area principale. Sidebar bianca con bordo `#D6DEEA`.
- Card: `#FFFFFF`, bordo 1px `#C9D3E3`, raggio 8px, `box-shadow: 0 3px 0 #DCE4F0` (bordo del foglio, nessuna sfocatura).
- Inchiostro (accent) `#2340A0`; testo `#1B2433`; secondario `#556178`; righe `#DCE6F5`; evidenziatore `#FFE27A` (per la materia attiva: `linear-gradient(transparent 55%, #FFE27A 55%, #FFE27A 92%, transparent 92%)`); successo `#2F9E6B` (testo `#1F7A50`).
- Post-it del Companion: `#FFF1A8`, ombra `0 3px 0 #E8D77F`, testo secondario `#5C4E12`, `rotate(-1.2deg)`. È l'unico elemento ruotato.
- Font: Figtree per il testo; Caveat 600 in inchiostro per i numeri grandi, i titoli dei widget e il saluto. Spazio fra i widget 18px. Glow spento.

### Fosforo (scuro, moduli hardware con display a punti)
- Sfondo `#110709`. **Unica decorazione:** un grande cerchio in basso a destra con `radial-gradient(circle at 30% 30%, #4A131B 0%, #2A0A10 45%, #170609 70%)`, più un cerchio sottile in alto a destra, bordo 1px `rgba(255,214,206,0.08)`. Nient'altro sullo sfondo.
- Card: `rgba(26,13,15,0.9)`, bordo 1px `rgba(255,214,206,0.12)`, raggio 14px.
- "Display" (timer, faccia, miniature): `#0B0405`, texture `radial-gradient(rgba(255,230,220,0.07) 1px, transparent 1.3px)` a 7px, bordo `rgba(255,214,206,0.08)`, raggio 10px.
- Fosforo (punti accesi, numeri) `#F4E9E4`; punti spenti `#3A2326`; testo `#F2E6E1`; secondario `#B39C97`; LED `#FF4A3D`.
- Font: JetBrains Mono per il testo, sempre in maiuscolo/minuscolo normale (**niente tutto maiuscolo**); Doto 900 solo per i numeri.
- **Regole per non renderlo opprimente:**
  1. I puntini compaiono solo in numeri, quadrante del timer, faccia del Companion e barre di avanzamento. Mai nei testi.
  2. Il rosso LED si usa solo per gli stati attivi in quel momento (timer in corso, server online). Mai decorativo.
  3. Una sola decorazione di sfondo.
- I pulsanti sono cerchi solo contornati; la voce attiva e i selettori sono pillole chiare piene.
- Glow spento.

## Qualità minima (vale per tutti i temi)

- Contrasto testo almeno 4.5:1: controllalo per ogni coppia testo/sfondo dei token e segnalami quelle che non passano.
- Focus da tastiera visibile in tutti i temi.
- `prefers-reduced-motion` e l'impostazione Animazioni disattivano le transizioni.
- Cambiare tema non richiede di riavviare l'app e non causa flash del tema sbagliato all'avvio. Applica `data-theme` prima del primo render, come già fa `BootGate`/`splash`, se possibile.

## Definizione di "fatto"

- I 4 temi sono selezionabili da Impostazioni → Aspetto, e la scelta resta salvata dopo il riavvio.
- Ogni widget ha la sua 1×1 ultra minimal, come da tabella, in tutti e 4 i temi.
- Con il layout dei mockup (Studio `XL`, Companion `M`, File `S`, slot vuoto, YouTube `L`, Note `STRIP`), ogni tema a 1440×900 è visivamente identico al suo file in `temi-dashboard/docs/design/temi/`, a parte i dati reali.
- A 1440×900 e a 1280×800 la dashboard sta nella finestra senza scorrere in tutti i temi.
- Ogni widget, in ogni sua taglia e in ogni tema, non ha contenuto tagliato né scrollbar.
- `grep` non trova colori esadecimali nei componenti, salvo i colori delle materie e le definizioni dei token.
- Build e lint passano.
- Alla fine, scrivimi un elenco delle cose da controllare a mano con `npm run tauri dev`, tema per tema.
