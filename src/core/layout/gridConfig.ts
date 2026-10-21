/**
 * Parametri "fisici" della griglia che NON sono impostazioni utente,
 * perché cambiarli invaliderebbe i layout salvati e le taglie dei widget
 * (vedi core/widgets/sizes.ts).
 *
 * Il numero di colonne è fisso. Le RIGHE sono invece impostabili
 * (settings.gridRows, minimo 4): aumentarle non invalida nessun layout.
 *
 * L'altezza di riga si ricava dall'altezza disponibile (la griglia riempie
 * la finestra); lo spazio fra i widget lo decide il tema (--grid-gap).
 */
export const GRID_COLS = 6;

// Altezza minima di riga in px: sotto questa soglia meglio far scorrere .main che schiacciare i widget.
export const MIN_ROW_HEIGHT = 120;
