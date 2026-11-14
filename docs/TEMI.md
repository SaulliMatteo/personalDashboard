# Temi e stile

## Regole

- I mockup approvati in `docs/mockup/` (`temi/`, `mobile/`, `gruppi/`, `widget/`; solo in locale, non nel repo) sono
  la fonte di verità per la grafica: l'app deve risultare identica. Se codice e mockup non concordano, vale il mockup.
  I mockup di base dei quattro temi citati nei commenti come `temi-dashboard/docs/design/temi/*.html` (`notte.html`,
  `widget-1x1.html`…) stanno in un altro progetto e non in questa cartella.
- Ogni colore viene dai token del tema: niente esadecimali nei componenti (eccezione: colori scelti dall'utente, come
  materie e cartelle).
- Ogni nuovo widget deve funzionare in tutti e 4 i temi (Notte, Opaco, Quaderno, Fosforo), giorno e notte, e avere una
  taglia 1×1 ultra minimal. Anche le pagine di dettaglio usano il linguaggio completo del tema (parti per tema, non
  solo colori).

## Come funzionano

4 temi (`core/theme/themes.ts`), scelti con `data-theme` su `<html>`; ogni tema ridefinisce i
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

## Cambiare il design

- Colori, raggi, font, spaziature: `styles/tokens.css` (e le impostazioni Aspetto/Effetti, che li sovrascrivono su `<html>`).
- Usa sempre i token (`--bg-card`, `--surface-1/2/3`, `--accent`, `--on-accent`, `--text-*`): così il tema chiaro funziona da solo.
- Ogni componente ha il suo `.css` accanto; niente CSS globale fuori da `styles/`.
- Come appare il timer (colori, testo, anello): `widgets/study/timer/useTimerView.ts`, usato da widget e pagina.
- I temi sono 4 (Notte, Opaco, Quaderno, Fosforo), ognuno in due varianti, giorno e notte, che cambiano **solo i
  colori** (forme, font e componenti restano quelli del tema). Su `<html>` ci sono `data-theme` e `data-mode`
  (`giorno|notte`, già risolta). La variante nativa (Notte e Fosforo: notte; Opaco e Quaderno: giorno) è il blocco
  `:root[data-theme="<id>"]` di `tokens.css`; l'altra è un blocco completo `:root[data-theme][data-mode]` in
  `tokens-varianti.css` (con pigmenti di Opaco notte, post-it di Quaderno notte e anteprime della scheda Aspetto).
  Un token nuovo va aggiunto in entrambi i file. I mockup in `docs/mockup/` sono la fonte di verità.
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
