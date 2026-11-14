# Temi e stile

## Regole

- I mockup approvati in `docs/mockup/` (`temi/`, `mobile/`, `gruppi/`, `widget/`; solo in locale, non nel repo) sono
  la fonte di verità per la grafica: l'app deve risultare identica. Se codice e mockup non concordano, vale il mockup.
  I mockup di base dei quattro temi citati nei commenti come `temi-dashboard/docs/design/temi/*.html` (`notte.html`,
  `widget-1x1.html`…) stanno in un altro progetto e non in questa cartella.
- Ogni colore viene dai token del tema: niente esadecimali nei componenti (eccezione: colori scelti dall'utente, come
  materie e cartelle).
- Ogni nuovo widget deve funzionare in tutti e 6 i temi (Notte, Opaco, Quaderno, Fosforo, Vetro, Ombra), giorno e
  notte, e avere una taglia 1×1 ultra minimal. Anche le pagine di dettaglio usano il linguaggio completo del tema
  (parti per tema, non solo colori).

## Come funzionano

6 temi (`core/theme/themes.ts`), scelti con `data-theme` su `<html>`; ogni tema ridefinisce i
token di `src/styles/tokens.css` (colori, `--card-*`, `--panel-*`, `--radius-*`, `--font-display`, `--btn-*`…).
Ogni tema ha due varianti, giorno e notte (`data-mode`, impostazione `themeMode` con `auto` che segue il sistema):
cambiano solo i colori, **tranne in Ombra** (vedi sotto). La variante nativa sta in `tokens.css`, l'altra in
`tokens-varianti.css` (un token nuovo va in entrambi). Il codice legge il tema risolto con `useTheme()` (`mode`,
`accent`…), mai `themeMode`.
Quando un pezzo cambia *forma* per tema si usa `useThemeVariant(map)` (`core/theme/variants.ts`), mai
`if (theme === …)`; le varianti-componente si rendono con `createElement` (lint `static-components`). Le card per
tema dei widget stanno in `card/cards.ts` e le pagine di dettaglio riusano la card M. In Opaco ogni widget ha un
pigmento (`data-pigment` sulla cella e su `.detail-scope`) che ridefinisce i token. Un `.css` accanto a ogni
componente, niente CSS globale fuori da `src/styles/`. `.main` in `AppShell` è l'unico elemento che scrolla, tranne
nella Stanza comune (`AppShell scroll={false}`): lì la pagina sta nella finestra e scorre solo la lista Membri.

## Cambiare il design

- Colori, raggi, font, spaziature: `styles/tokens.css` (e le impostazioni Aspetto/Effetti, che li sovrascrivono su `<html>`).
- Usa sempre i token (`--bg-card`, `--surface-1/2/3`, `--accent`, `--on-accent`, `--text-*`): così il tema chiaro funziona da solo.
- Ogni componente ha il suo `.css` accanto; niente CSS globale fuori da `styles/`.
- Come appare il timer (colori, testo, anello): `widgets/study/timer/useTimerView.ts`, usato da widget e pagina.
- I temi sono 6 (Notte, Opaco, Quaderno, Fosforo, Vetro, Ombra), ognuno in due varianti, giorno e notte, che
  cambiano **solo i colori** (forme, font e componenti restano quelli del tema). Su `<html>` ci sono `data-theme` e
  `data-mode` (`giorno|notte`, già risolta). La variante nativa (Notte, Fosforo e Ombra: notte; Opaco, Quaderno e
  Vetro: giorno) è il blocco `:root[data-theme="<id>"]` di `tokens.css`; l'altra è un blocco completo
  `:root[data-theme][data-mode]` in `tokens-varianti.css` (con pigmenti di Opaco notte, post-it di Quaderno notte e
  anteprime della scheda Aspetto). Un token nuovo va aggiunto in entrambi i file. I mockup in `docs/mockup/` sono la
  fonte di verità (Vetro e Ombra: `docs/mockup/temi/Temi Vetro e Ombra.html`).
- **Eccezione di Ombra**: le due varianti sono due linguaggi, non solo due palette. Di notte "Ombra" (nero assoluto,
  card con gli angoli tagliati, eclisse), di giorno "Fiamma" (alabastro e argento, card arrotondate con il filo di
  fiamma, stella). Cambiano anche forme, testi e Pixy: una voce di `ThemeVariants` può essere
  `perMode({ notte, giorno })` (`core/theme/variants.ts`), risolta da `useThemeVariant` col modo corrente; fuori da
  React (canvas, notifiche) si usa `resolveVariant(map, id, mode)`. Nel CSS bastano i selettori
  `:root[data-theme="ombra"][data-mode="…"]`. Mai `if (mode === …)` nei componenti, e gli altri temi non usano
  `perMode`. I nomi delle varianti in Aspetto vengono da `modeLabels` del tema.
- Nessun riferimento alla novel che ha ispirato Ombra: niente nomi di personaggi, termini o passaggi del libro,
  e niente personaggi disegnati. Restano solo simboli generici (eclisse, stella, fiamma, frammenti).
- Token che usano solo Vetro e Ombra (default spenti nel `:root` comune di `tokens.css`): `--accent-2`,
  `--font-flavor`; Vetro `--photo-filter`, `--pane-*`, `--card-inset`, `--sheen`, `--blur`; Ombra `--card-gloss`,
  `--core-fill/-ink/-glow` (il nucleo), `--prog(-glow)`, `--rune-glow`, `--fx-light/-shadow/-len`.
- Vetro: dietro l'app c'è `.app-wall` (in `AppShell`), con la foto sfocata da `--photo-filter`; la sidebar è
  un'isola di vetro e `.main` un grande pannello (`shell.css`), le card hanno `backdrop-filter` (`BorderGlow.css`).
  `--modal-bg` resta pieno, perché lo usano anche le `<option>` dei menu nativi. In Vetro `--btn-primary-bg` è un
  gradiente: va usato solo come `background`, mai in `color-mix` o come colore.
- Vetro, sfondo: senza immagine `app/GlassWall.tsx` disegna su canvas una stanza con i token `--room-*` (ridisegnata
  al cambio di variante); con un'immagine scelta in Aspetto (`core/theme/wallpaper.ts`) mostra quella. L'immagine
  sta nella tabella locale `device_wallpaper` (migrazione 28, non sincronizzata, già ridimensionata a 1600 px JPEG
  come data URL): Esporta/Importa i dati copia tutto il database, quindi la porta con sé.
- Vetro, effetti (impostazioni per dispositivo del gruppo `glass`, attributi su `<html>` da `applySettings.ts`):
  `glassSheen` → `data-glass-sheen` (riflesso che segue il puntatore), `glassAnimatedWall` → `data-glass-wall`
  (lenta deriva dello sfondo), `glassStrongBlur` → `data-glass` `strong|light` (con `light` il blur resta solo su
  `.main` e le card sono più opache). Tutto il movimento si spegne con `data-animations="off"` e con
  `prefers-reduced-motion`.
- Effetti del puntatore: un solo listener, `app/usePointerFx.ts`, scrive `--lx/--ly` (sulla card sotto il
  puntatore), `--sx/--sy` (ombra opposta, lunga `--fx-len`) e `--px/--py` (su `.app-wall`). Si sceglie per tema con
  `POINTER_FX` in `AppShell`; sul telefono è spento.
- Ombra, forme: i raggi vengono dai token (2–3 px di notte, 16 px di giorno). Di notte la cornice (`BorderGlow.css`)
  ha due angoli tagliati dipinti col colore del fondo (`--cut`, `--cut-edge*`, come il mockup: niente `clip-path`,
  che taglierebbe l'ombra) e il testo tenue si scurisce (`--text-hidden`) finché non si passa sulla card; di giorno
  c'è il filo di fiamma sul bordo alto (`::after`, `--flame-line`/`--flame-glow`). In Ombra `::before`, `::after` e
  `.edge-light` della cornice non fanno il glow.
- Ombra, effetti: `POINTER_FX` dà ombre proiettate (`--sx/--sy`) e luce sullo sfondo (`--px/--py` su `.app-wall`,
  con `--fx-light` e, di giorno, l'alone `--wall-top`); il riquadro `.main` è trasparente per lasciarla vedere.
  Fiamma ha le scintille di `app/EmberSparks.tsx` (mappa `OVERLAYS` in `AppShell`, colori `--spark-hot`/`--spark-glow`):
  il ciclo gira solo mentre il puntatore si muove o ci sono scintille. Tutto spento con le animazioni disattivate,
  con `prefers-reduced-motion` e sul telefono.
- Ombra, Studio: quadrante `CoreDial` (`Dials.tsx`, il nucleo con `--core-fill/-ink/-glow`). La card dello Studio di
  Vetro e quella di Ombra sono lo stesso componente (`StudyCardVetro.tsx`, prefisso `sv`) con quadrante diverso:
  nel mockup hanno la stessa disposizione; le regole di Ombra stanno in fondo a `StudyCardVetro.css`. Pixy e Note
  hanno le card `CompanionCardOmbra`/`NotesCardOmbra`.
- Pixy di Ombra: `FACE_STYLES.ombra = perMode({ notte: shadow, giorno: flame })`, due corpi disegnati da
  `core/pixy/render/ombraRenderer.ts` nel riquadro 100×100 del mockup (`pixyO()`): l'ombra (corpo nero a tentacoli,
  occhi luminosi, si schiaccia quando dorme o è triste) e la fiamma (globo bianco, cinque fiamme che crescono e
  calano con l'espressione, alone dorato). Le forme vengono dai parametri continui dell'animatore (palpebre,
  inclinazione, bocca), non da pose fisse; `FaceFrame.emotion`/`pose` servono solo agli oggetti che i parametri non
  dicono (maschera quando studia o lavora, tazza in pausa, frammenti a fine pomodoro, saluto). I costumi che il
  mockup ridisegna (libro, cuffia, coperta, popcorn, occhiali 3D, spada, neve, barra, pausa, coriandoli) sono oggetti;
  gli altri si disegnano a punti come negli stili pieni (`paintField` di `solidRenderer.ts` + `costumeField`).
  Colori dai token `--pixy-*` (neutri negli altri temi), l'inchiostro è `--face-on`/`--accent`.
- In Ombra il carattere di Pixy lo decide la variante (`core/pixy/themePersonality.ts`): Sarcastico di notte, Stoico
  di giorno; l'impostazione `companionPersonality` non cambia e torna a valere negli altri temi, ed è quella che va ai
  compagni dei Gruppi. Nella pagina di Pixy la scheda Personalità mostra il selettore delle due varianti (cambia
  `themeMode`) e la galleria delle pose ha le miniature disegnate (`PoseThumb.tsx`). Di notte le frasi della card
  sono pensieri tra apici (`.cm-bubble`).
- Pixy di Vetro: stile `glass` di `core/pixy/render/styles.ts` (matrice LED con i punti spenti visibili) in un
  riquadro lucido (`.cv-box`). Il quadrante dello Studio è `GlassDial` (`Dials.tsx`). In Vetro e in Ombra orologio,
  data, meteo, File Transfer, Monitor, Tempo al PC, Lavagna e YouTube usano le card di Notte: coi token bastano.
- L'impostazione `themeMode` è `giorno|notte|auto`: `auto` segue il sistema (`useSystemDark`) anche ad app aperta.
  `useTheme()` restituisce il tema risolto (`mode`, `scheme`, `glow`, `defaultAccent`, `accent`): il codice non
  guarda mai `themeMode` direttamente. L'accent personalizzato è uno per variante (`ACCENT_KEYS` in `schema.ts`).
  Lo script in `index.html` applica tema e variante dalla cache (`pd-theme`, `pd-mode`, `pd-theme-mode`) prima del
  bundle, ricalcolando `auto` dal sistema; la splash ha i colori di tutte le 12 combinazioni. Un tema nuovo va
  aggiunto anche lì (elenco dei temi ammessi, variante nativa, colori della splash) e in `settingsPage.css`
  (anteprime `.sp-theme--<id>`): sono elenchi scritti a mano che il compilatore non controlla.
- I canvas che leggono i token (faccia del Companion, inchiostro delle Note) li rileggono quando cambiano
  `theme.id`/`theme.mode`. Nelle Note il colore `THEME_INK` (`#f2f2f4`) si disegna con `--text-primary`.
- Quando un pezzo cambia **forma** per tema (non solo colore) si usa `useThemeVariant(map)` di
  `core/theme/variants.ts` con una `ThemeVariants<T>` (una voce per tema, `perMode` solo per Ombra), mai
  `if (theme === …)`.
  Se la variante è un componente, si rende con `createElement(Variant, props)` (regola lint `static-components`).
- Le card per tema dei widget stanno in `card/cards.ts` (es. `STUDY_CARDS`, `COMPANION_CARDS`): la pagina di
  dettaglio riusa la card M del tema, così è identica alla dashboard.
- In Opaco ogni widget ha un pigmento (`data-pigment`, mappa in `themes.ts`) che ridefinisce i token nel suo riquadro
  e nella sua pagina di dettaglio (`.detail-scope`). In Quaderno `.card-postit` dà l'aspetto del post-it.
- Token di forma utili: `--card-*`, `--panel-*`, `--radius-item` (pillola in Opaco/Fosforo, non usarlo per
  righe alte), `--btn-ghost-*`/`--btn-primary-*`, `--row-active-*`, `--display-texture`/`--display-border`,
  `--thumb-*` (miniature video), `--main-bg` (in Quaderno è il foglio a quadretti).


## Insidie

- `<select>` nativi: il menu aperto lo disegna il sistema, quindi `color-scheme: inherit` sul select e sfondo pieno
  sulle `option` (`--modal-bg`); `--panel-bg` non va bene, in Fosforo è trasparente e il menu esce bianco.
- La WebView di Android non conosce `scrollbar-width`: una barra stilizzata con `::-webkit-scrollbar` va tolta a mano.

## Mockup dei Gruppi (`docs/mockup/gruppi/`)

Ogni file è una schermata e contiene tutte le 8 versioni (4 temi × giorno e notte); si sceglie dal selettore in basso a
destra o dall'indirizzo: `stanza-comune.html#tema=opaco&modo=notte` (`tema` = notte | opaco | quaderno | fosforo,
`modo` = giorno | notte; nella Stanza comune anche `stato` = privato | vuota | offline).

| File | Schermata |
|---|---|
| `stanza-comune.html` | Stanza comune, senza scorrimento: sala, lista Membri, schede Messaggi e Da fare |
| `impostazioni-stanza.html` | Pagina Gruppi (dettaglio del widget): "Cosa vedono gli altri", gruppi, schede Gruppo / Classifica / Report |
| `widget.html` | Widget Gruppi 1×1, M (classifica) e L (solo classifica, con barre; il titolo non va mai a capo) |
| `finestre.html` | Scelta del nome utente, Crea un gruppo, Entra con un codice (nello stato di errore) |
| `primo-accesso.html` | Stanza comune senza account: "Accedi con Google" e cosa viene condiviso |
| `stati.html` | Accesso in corso nel browser, nessun gruppo, gruppi non raggiungibili |
| `amici-notifiche.html` | Campanella, pannello degli amici, chat e schede dei widget |

- La sala è un disegno diverso per tema, non solo colori: Notte illustrazione notturna, Opaco blocchi di pigmento senza
  contorni, Quaderno penna sul foglio a quadretti con la luce a evidenziatore, Fosforo matrice di LED con lo studio in
  LED rosso. Cambia anche tra chiaro e scuro dello stesso tema.
- I mockup caricano i font da Google Fonts solo per comodità: nell'app si usano i pacchetti `@fontsource` locali.
- Pigmento in Opaco: i mockup usano "blu" per la sala e il widget e "carta" per le impostazioni; nell'app decide
  `pigmentFor` del registry.
- Stato mai affidato solo al colore: c'è sempre il testo del timer o "pausa", e ogni posto occupato è un `<button>`
  con `aria-label`.
- Nomi, tempi e codici sono inventati; il piccolo motore JavaScript in fondo a ogni file serve solo a mostrare il
  mockup e non va riusato nell'app.
