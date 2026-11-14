# Telefono e tocco

Parte nativa di Android (build, plugin, `MainActivity`): `docs/ANDROID.md`.

## Regole per ogni componente

Il layout è "compatto" (telefono) quando il lato corto della finestra è sotto i 600 dp (`core/layout/useCompact.ts`;
i CSS usano `:root[data-compact]`); tablet e desktop restano nel layout desktop. Valgono per ogni componente nuovo:
- un dialogo o menu ha `role="dialog"`/`aria-modal`/`role="menu"` e si chiude con Esc (l'indietro di Android passa da
  `core/nav/overlays.ts`, che manda Esc), e va aggiunto alle liste di overlay/dialogo/azioni di `styles/base.css`
  (sul telefono diventa un foglio dal basso);
- ciò che compare solo col mouse va mostrato anche in `@media (hover: none)`; le aree toccabili sotto i 44px si
  allargano con un `::after` invisibile e `inset: var(--hit)` dentro `@media (pointer: coarse)`; niente scorciatoie
  da tastiera suggerite con `useTouchOnly()`;
- i caratteri piccoli delle pagine si scrivono `max(Npx, var(--fs-min))` (13px sul telefono, 0 altrove);
- col dito si trascina solo dopo una pressione lunga: un tocco apre, uno scorrimento scorre;
- la WebView di Android non conosce `scrollbar-width`: una barra stilizzata con `::-webkit-scrollbar` va tolta a mano.

## Interfaccia del telefono

- **Layout** (mockup `docs/mockup/mobile/viste.html`): "compatto" quando il lato corto della finestra è sotto i 600 dp
  (`useCompact.ts`, l'unica definizione; `AppShell` mette `data-compact` su `<html>`). Tablet e desktop restano nel
  layout desktop. Sul telefono: sidebar come menu a scomparsa, barra in alto `ui/CompactBar` (titolo e ← della pagina;
  i `.dashboard-header` dei dettagli nascondono titolo e BackButton), dashboard `features/dashboard/MobileDashboard.tsx`
  a pagine 2×4 (4×2 in orizzontale) con i widget scalati con `zoom`.
- **Layout della dashboard del telefono**: tabella `dashboard_layout_mobile` (`mobileLayout.ts` puro, prova
  `scripts/layout/mobileLayout.test.mts`), mai scritto su `dashboard_layout`; il catalogo passa da
  `features/settings/catalog/useCatalogLayout.ts`. Taglie che esistono solo sul telefono (es. 2×1 di Studio e Gruppi):
  `phoneSizes` nella `WidgetDefinition`, non in `sizes` (che vale anche per il desktop); le unisce solo `phoneSizes()`
  di `mobileLayout.ts`. I dati di quelle card stanno in hook/funzioni senza UI (`useStudyCard`, `previewFaces`), pensati
  per un futuro widget della Home di Android.
- **Tocco** (anche tablet): col dito si trascina solo dopo una pressione lunga (dashboard del telefono, Note,
  tabellone, griglia desktop sul tablet con `features/dashboard/useLongPressGridDrag.ts`).
- **Leggibilità** (mockup `docs/mockup/mobile/ritocchi.html`): `--fs-min` è 0 fuori dal telefono e 13px con
  `data-compact` (card e mini della dashboard escluse, sono scalate). Sul telefono i dialoghi diventano fogli dal basso
  con la regola in `styles/base.css`, i `.nq-menu` del Quaderno anche (`noteEditor.css`).
- **Editor del Quaderno** (mockup `docs/mockup/mobile/quaderno.html`): `NoteEditor` con `useCompact()` disegna un'altra
  disposizione (nota fissa sopra la pagina, ← titolo ☆ ⋯, una riga di strumenti sopra la tastiera, il resto in
  `components/BottomSheet.tsx`); i pezzi in comune col desktop (esporta, pagine, colori…) sono variabili usate da
  entrambe, e **un comando nuovo va messo in tutte e due**. Con un foglio aperto il testo ha `inputmode="none"`,
  altrimenti Android riapre la tastiera al tocco su un pulsante.
- **Stanza comune in verticale**: `RoomScene layout="column"` (sala a grandezza vera, 8 posti) e `RoomSidePanel sheet`
  (schede in un foglio con la maniglia o trascinandolo, chiuso dall'indietro).
